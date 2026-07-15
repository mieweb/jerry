/**
 * `jerry mcp` — expose Jerry as an MCP server over stdio.
 *
 * Cursor / Claude Desktop spawn this process and speak MCP over stdin/stdout.
 * Consistent with the rest of the Jerry CLI, this is a thin bridge: the MCP
 * protocol is served locally over stdio, while tool execution is forwarded to
 * the running Jerry worker's `/v1/mcp` endpoint (which owns the database,
 * vector index, and other bindings).
 *
 * The upstream connection is established lazily so the server still starts if
 * the worker comes up shortly after the MCP client spawns it.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadConfig } from "./profile.js";

function log(message: string): void {
  // stdout is reserved for the MCP protocol; diagnostics go to stderr.
  process.stderr.write(`[jerry mcp] ${message}\n`);
}

/**
 * Lazily create and cache a connected upstream MCP client pointed at the
 * worker's `/v1/mcp` endpoint. Reconnects on the next call after a failure.
 */
function createUpstreamConnector(endpoint: URL): () => Promise<Client> {
  let client: Client | null = null;
  let connecting: Promise<Client> | null = null;

  return async function getUpstream(): Promise<Client> {
    if (client) return client;
    if (connecting) return connecting;

    connecting = (async () => {
      const next = new Client(
        { name: "jerry-mcp-proxy", version: "0.1.0" },
        { capabilities: {} }
      );
      const transport = new StreamableHTTPClientTransport(endpoint);
      await next.connect(transport);
      client = next;
      log(`connected to worker at ${endpoint.href}`);
      return next;
    })();

    try {
      return await connecting;
    } catch (error) {
      connecting = null;
      throw new Error(
        `Could not reach Jerry worker at ${endpoint.href}. Is it running? ` +
          `(${error instanceof Error ? error.message : String(error)})`
      );
    } finally {
      connecting = null;
    }
  };
}

/**
 * Start the Jerry MCP stdio server. Blocks until stdin closes.
 */
export async function startMcpServer(): Promise<void> {
  const { url } = loadConfig();
  const endpoint = new URL("/v1/mcp", url);
  const getUpstream = createUpstreamConnector(endpoint);

  const server = new Server(
    { name: "jerry", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const upstream = await getUpstream();
    return upstream.listTools();
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const upstream = await getUpstream();
    return upstream.callTool(request.params);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log(`ready (forwarding tools to ${endpoint.href})`);
}
