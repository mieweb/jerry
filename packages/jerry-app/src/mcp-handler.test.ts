/**
 * Tests for the hosted MCP endpoint handler (`/v1/mcp`).
 *
 * Exercises the Web Standard Streamable HTTP transport in stateless JSON mode
 * with a mock env — no worker runtime required.
 */

import { describe, it, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { handleMcpRequest, type McpWorkerEnv } from "./mcp-handler.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockEnv(): McpWorkerEnv {
  const db = {
    prepare: () => ({
      bind: () => ({
        all: async () => ({ results: [] }),
        run: async () => ({}),
      }),
    }),
  };
  return { DB: db as unknown as McpWorkerEnv["DB"] };
}

function jsonRpcRequest(body: unknown): Request {
  return new Request("http://localhost/v1/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  return JSON.parse(text) as Record<string, unknown>;
}

describe("handleMcpRequest", () => {
  it("lists exposed tools over HTTP", async () => {
    const response = await handleMcpRequest(
      jsonRpcRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
      mockEnv()
    );

    assert.equal(response.status, 200);
    const payload = await readJson(response);
    const tools = (payload.result as { tools?: Array<{ name: string }> })?.tools;
    assert.ok(Array.isArray(tools), "tools array present");
    const names = tools!.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "schedule_followup",
      "search_memory",
      "summarize_activity",
    ]);
  });

  it("executes a tool call over HTTP", async () => {
    // Keep the test offline: summarize_activity prefers live AW when reachable,
    // so a developer running ActivityWatch would otherwise get real events.
    globalThis.fetch = mock.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    const response = await handleMcpRequest(
      jsonRpcRequest({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "summarize_activity", arguments: { range: "today" } },
      }),
      mockEnv()
    );

    assert.equal(response.status, 200);
    const payload = await readJson(response);
    const content = (
      payload.result as { content?: Array<{ type: string; text?: string }> }
    )?.content;
    assert.ok(Array.isArray(content) && content.length > 0, "content present");
    const parsed = JSON.parse(content![0].text ?? "{}");
    assert.equal(parsed.error, false);
    assert.match(String(parsed.message), /No evidence from ActivityWatch/);
  });
});
