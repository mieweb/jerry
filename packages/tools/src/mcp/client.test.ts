/**
 * Tests for MCP client wrapper.
 *
 * Uses mock stdio transport to test client behavior without
 * spawning actual MCP server processes.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { McpClient } from "./client.js";

describe("McpClient", () => {
  describe("constructor", () => {
    it("stores config", () => {
      const config = {
        name: "test-server",
        command: "node",
        args: ["server.js"],
      };
      const client = new McpClient(config);
      assert.equal(client.getName(), "test-server");
      assert.equal(client.isConnected(), false);
    });
  });

  describe("getName", () => {
    it("returns server name from config", () => {
      const client = new McpClient({ name: "my-server", command: "echo" });
      assert.equal(client.getName(), "my-server");
    });
  });

  describe("isConnected", () => {
    it("returns false initially", () => {
      const client = new McpClient({ name: "test", command: "echo" });
      assert.equal(client.isConnected(), false);
    });
  });

  describe("listTools without connect", () => {
    it("throws when not connected", async () => {
      const client = new McpClient({ name: "test", command: "echo" });
      await assert.rejects(
        () => client.listTools(),
        /not connected/
      );
    });
  });

  describe("callTool without connect", () => {
    it("throws when not connected", async () => {
      const client = new McpClient({ name: "test", command: "echo" });
      await assert.rejects(
        () => client.callTool("some-tool", {}),
        /not connected/
      );
    });
  });

  describe("disconnect without connect", () => {
    it("does nothing silently", async () => {
      const client = new McpClient({ name: "test", command: "echo" });
      await client.disconnect();
      assert.equal(client.isConnected(), false);
    });
  });
});

describe("McpClient integration (skipped without MCP server)", () => {
  const skipIntegration = !process.env.JERRY_INTEGRATION?.includes("mcp");

  it("connects to real MCP server", { skip: skipIntegration }, async () => {
    // This test requires: JERRY_INTEGRATION=mcp
    // And a running footnote MCP server
    const client = new McpClient({
      name: "footnote",
      command: "node",
      args: ["../../vendor/footnote/bin/docidx.js", "mcp"],
    });

    try {
      await client.connect();
      assert.equal(client.isConnected(), true);

      const tools = await client.listTools();
      assert.ok(Array.isArray(tools));
      assert.ok(tools.length > 0);

      const toolNames = tools.map((t) => t.name);
      assert.ok(
        toolNames.includes("search_hybrid") || toolNames.includes("search"),
        `Expected hybrid search tool, got: ${toolNames.join(", ")}`
      );
    } finally {
      await client.disconnect();
    }
  });
});
