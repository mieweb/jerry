/**
 * Tests for the Jerry MCP server (expose side).
 *
 * Drives createJerryMcpServer() over an in-memory transport with a mock
 * ToolContext — no worker, database, or child process required.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createJerryMcpServer, JERRY_MCP_TOOL_NAMES } from "./server.js";
import type { ToolContext } from "../runtime/types.js";

/** Mock ToolContext: empty activity DB, no vectors, resolving scheduleWake. */
function mockContext(): ToolContext {
  const db = {
    prepare: () => ({
      bind: () => ({
        all: async () => ({ results: [] }),
        run: async () => ({}),
      }),
    }),
  };

  return {
    sessionId: "test-session",
    db: db as unknown as ToolContext["db"],
    scheduleWake: async () => {},
    suspendForUser: () => {},
    suspendForApproval: () => {},
  };
}

async function connectClient() {
  const server = createJerryMcpServer(mockContext());
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} }
  );
  await client.connect(clientTransport);
  return { client, server };
}

function parseToolResult(result: unknown): Record<string, unknown> {
  const content = (result as { content?: Array<{ type: string; text?: string }> })
    .content;
  assert.ok(Array.isArray(content) && content.length > 0, "expected content");
  const text = content[0].text ?? "";
  return JSON.parse(text) as Record<string, unknown>;
}

describe("createJerryMcpServer", () => {
  it("exposes exactly the Jerry tool subset", async () => {
    const { client, server } = await connectClient();
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).sort();
      assert.deepEqual(names, [...JERRY_MCP_TOOL_NAMES].sort());
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("advertises input schemas for each tool", async () => {
    const { client, server } = await connectClient();
    try {
      const { tools } = await client.listTools();
      const summarize = tools.find((t) => t.name === "summarize_activity");
      assert.ok(summarize?.inputSchema, "summarize_activity has inputSchema");
      assert.ok(
        (summarize?.inputSchema as { properties?: Record<string, unknown> })
          .properties?.range,
        "range property present"
      );
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("executes summarize_activity (no events → friendly message)", async () => {
    const { client, server } = await connectClient();
    try {
      const result = await client.callTool({
        name: "summarize_activity",
        arguments: { range: "today" },
      });
      const parsed = parseToolResult(result);
      assert.equal(parsed.error, false);
      assert.equal(parsed.summary, null);
      assert.match(String(parsed.message), /No activity data/);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("executes search_memory (no vector index → error result)", async () => {
    const { client, server } = await connectClient();
    try {
      const result = await client.callTool({
        name: "search_memory",
        arguments: { query: "kubernetes notes" },
      });
      const parsed = parseToolResult(result);
      assert.equal(parsed.error, true);
      assert.match(String(parsed.message), /not available/);
      assert.equal(result.isError, true);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("executes schedule_followup and returns a scheduled time", async () => {
    const { client, server } = await connectClient();
    try {
      const result = await client.callTool({
        name: "schedule_followup",
        arguments: { when: "in 2 hours", reason: "check build" },
      });
      const parsed = parseToolResult(result);
      assert.equal(parsed.error, false);
      assert.ok(parsed.scheduledFor, "scheduledFor present");
      assert.equal(parsed.reason, "check build");
    } finally {
      await client.close();
      await server.close();
    }
  });
});
