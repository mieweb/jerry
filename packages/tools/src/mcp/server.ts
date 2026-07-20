/**
 * Jerry MCP server (expose side).
 *
 * Wraps a subset of Jerry's runtime tools as an MCP server so external
 * clients (Cursor, Claude Desktop, other agents) can invoke them.
 *
 * This is the inverse of client.ts / footnote-adapter.ts: instead of
 * consuming an external MCP server, Jerry becomes one.
 *
 * The same server can be driven by any transport:
 * - stdio (CLI: `jerry mcp`)   → StdioServerTransport
 * - HTTP  (worker: `/v1/mcp`)  → WebStandardStreamableHTTPServerTransport
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import type { ToolSet } from "ai";
import { createJerryTools } from "../runtime/index.js";
import type { ToolContext } from "../runtime/types.js";

/**
 * Tool names Jerry exposes to external MCP clients.
 * Intentionally a subset — file/index tools stay internal.
 */
export const JERRY_MCP_TOOL_NAMES = [
  "summarize_activity",
  "search_memory",
  "schedule_followup",
] as const;

export type JerryMcpToolName = (typeof JERRY_MCP_TOOL_NAMES)[number];

/**
 * Clean input shapes (ZodRawShape) for the exposed tools.
 *
 * These mirror each tool's `parameters` but avoid transforms/effects so the
 * MCP SDK can emit a clean JSON Schema for clients. Execution still routes
 * through the canonical tool `execute` from `createJerryTools`.
 */
const INPUT_SHAPES: Record<JerryMcpToolName, z.ZodRawShape> = {
  summarize_activity: {
    range: z
      .string()
      .describe(
        "Natural language time range, e.g. 'last 2 hours', 'today', 'yesterday afternoon', 'this morning'"
      ),
  },
  search_memory: {
    query: z
      .string()
      .describe("What to search for — describe the content you're looking for"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("Maximum number of results to return (default 5)"),
  },
  schedule_followup: {
    when: z
      .string()
      .describe(
        'When to follow up. Can be relative ("in 2 hours") or absolute ("tomorrow at 9am")'
      ),
    reason: z
      .string()
      .describe("What this follow-up is for — included when the agent wakes up"),
  },
};

/** Minimal shape we rely on from an AI SDK tool object. */
interface ExecutableTool {
  description?: string;
  execute?: (
    args: Record<string, unknown>,
    options: { toolCallId: string; messages: [] }
  ) => Promise<unknown>;
}

function asExecutable(tool: ToolSet[string] | undefined): ExecutableTool {
  return (tool ?? {}) as ExecutableTool;
}

/**
 * Build an MCP server that exposes Jerry's tool subset.
 *
 * @param ctx - Tool context (db, vectors, scheduleWake) used to execute tools
 * @returns An McpServer ready to connect to a transport
 */
export function createJerryMcpServer(ctx: ToolContext): McpServer {
  const server = new McpServer(
    { name: "jerry", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  const tools = createJerryTools(ctx);

  for (const name of JERRY_MCP_TOOL_NAMES) {
    const impl = asExecutable(tools[name]);

    server.registerTool(
      name,
      {
        description: impl.description ?? `Jerry ${name} tool`,
        inputSchema: INPUT_SHAPES[name],
      },
      async (args: Record<string, unknown>) => {
        try {
          if (!impl.execute) {
            throw new Error(`Tool "${name}" has no executor`);
          }
          const result = await impl.execute(args, {
            toolCallId: crypto.randomUUID(),
            messages: [],
          });
          const isError =
            typeof result === "object" &&
            result !== null &&
            (result as { error?: unknown }).error === true;

          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            isError,
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: true,
                  message:
                    error instanceof Error ? error.message : String(error),
                }),
              },
            ],
            isError: true,
          };
        }
      }
    );
  }

  return server;
}

/**
 * Serve a single `/v1/mcp` request over the MCP Streamable HTTP transport.
 *
 * Runs in stateless mode (fresh server + transport per request, JSON responses)
 * so it works within the per-request execution model of Cloudflare Workers and
 * other Web Standard runtimes.
 *
 * @param request - Incoming Web Standard Request
 * @param ctx - Tool context used to execute tools
 * @returns A Web Standard Response
 */
export async function handleJerryMcpHttp(
  request: Request,
  ctx: ToolContext
): Promise<Response> {
  const server = createJerryMcpServer(ctx);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);
  return transport.handleRequest(request);
}
