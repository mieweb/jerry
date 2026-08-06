/**
 * Hosted MCP endpoint (`/v1/mcp`).
 *
 * Exposes Jerry's tool subset over the MCP Streamable HTTP transport so
 * remote clients can consume Jerry as an MCP server. Uses the Web Standard
 * transport (Request/Response) so it runs on Cloudflare Workers as well as
 * Node targets.
 *
 * Runs in stateless mode: a fresh server + transport is created per request
 * and JSON responses are returned (no long-lived SSE session), which fits the
 * per-request execution model of Workers.
 */

import { handleJerryMcpHttp } from "@mieweb/jerry-tools/mcp";
import type { ToolContext } from "@mieweb/jerry-tools/runtime";

/**
 * Subset of worker bindings needed to execute the exposed tools.
 */
export interface McpWorkerEnv {
  DB: ToolContext["db"];
  VECTORS?: ToolContext["vectors"];
  BUCKET?: ToolContext["bucket"];
}

/**
 * Build a ToolContext from worker bindings.
 *
 * `scheduleWake` is not available outside an agent session (Durable Object),
 * so `schedule_followup` surfaces a clear error when called over the hosted
 * endpoint. `summarize_activity` and `search_memory` are fully functional.
 */
function buildToolContext(env: McpWorkerEnv): ToolContext {
  return {
    sessionId: `mcp-${crypto.randomUUID()}`,
    db: env.DB,
    vectors: env.VECTORS,
    bucket: env.BUCKET,
    scheduleWake: async () => {
      throw new Error(
        "schedule_followup is not available over the hosted MCP endpoint; " +
          "run it from a Jerry agent session instead."
      );
    },
    suspendForUser: () => {},
    suspendForApproval: () => {},
  };
}

/**
 * Handle an incoming `/v1/mcp` request via the MCP Streamable HTTP transport.
 */
export async function handleMcpRequest(
  request: Request,
  env: McpWorkerEnv
): Promise<Response> {
  const ctx = buildToolContext(env);
  return handleJerryMcpHttp(request, ctx);
}
