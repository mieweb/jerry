/**
 * Tests for footnote MCP adapter.
 *
 * Uses mock MCP client to test tool mapping and result parsing
 * without connecting to actual footnote server.
 */

import { describe, it } from "node:test";
import type { Tool } from "ai";
import assert from "node:assert/strict";
import { createFootnoteMcpTools, FOOTNOTE_TOOL_NAMES } from "./footnote-adapter.js";
import type { McpClient, McpCallResult } from "./client.js";

/**
 * Create a mock MCP client for testing.
 */
function createMockClient(
  callToolImpl: (name: string, args: Record<string, unknown>) => McpCallResult
): McpClient {
  return {
    getName: () => "mock-footnote",
    isConnected: () => true,
    connect: async () => {},
    disconnect: async () => {},
    listTools: async () => [],
    callTool: async (name: string, args: Record<string, unknown>) =>
      callToolImpl(name, args),
  } as unknown as McpClient;
}

async function executeTool(
  tool: Tool,
  input: Record<string, unknown>
): Promise<unknown> {
  if (!tool.execute) {
    throw new Error("Tool execute is not defined");
  }
  return tool.execute(input, {
    toolCallId: "test",
    messages: [],
    abortSignal: undefined as never,
  });
}

describe("FOOTNOTE_TOOL_NAMES", () => {
  it("exports expected tool names", () => {
    assert.deepEqual([...FOOTNOTE_TOOL_NAMES], [
      "search_hybrid",
      "search_fts",
      "search_literal",
      "read_document",
    ]);
  });
});

describe("createFootnoteMcpTools", () => {
  it("returns all footnote tools", () => {
    const mockClient = createMockClient(() => ({
      content: [{ type: "text", text: "[]" }],
    }));

    const tools = createFootnoteMcpTools(mockClient);
    assert.ok(tools.search_hybrid);
    assert.ok(tools.search_fts);
    assert.ok(tools.search_literal);
    assert.ok(tools.read_document);
  });

  describe("search_hybrid", () => {
    it("calls MCP with query and limit", async () => {
      const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
      const mockClient = createMockClient((name, args) => {
        calls.push({ name, args });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify([
                { path: "/doc1.md", score: 0.9, snippet: "test content" },
              ]),
            },
          ],
        };
      });

      const tools = createFootnoteMcpTools(mockClient);
      const result = await executeTool(tools.search_hybrid, {
        query: "kubernetes",
        limit: 5,
      }) as {
        source: string;
        method: string;
        count: number;
        results: Array<{ path: string }>;
      };

      assert.equal(calls.length, 1);
      assert.equal(calls[0].name, "search_hybrid");
      assert.deepEqual(calls[0].args, { query: "kubernetes", limit: 5 });

      assert.equal(result.source, "footnote-mcp");
      assert.equal(result.method, "hybrid");
      assert.equal(result.count, 1);
      assert.equal(result.results[0].path, "/doc1.md");
    });

    it("handles MCP errors gracefully", async () => {
      const mockClient = createMockClient(() => {
        return {
          content: [{ type: "text", text: "Connection failed" }],
          isError: true,
        };
      });

      const tools = createFootnoteMcpTools(mockClient);
      const result = await executeTool(tools.search_hybrid, { query: "test" }) as {
        source: string;
        results: Array<{ snippet?: string }>;
      };

      assert.equal(result.source, "footnote-mcp");
      assert.equal(result.results.length, 1);
      assert.ok(result.results[0].snippet?.includes("Connection failed"));
    });

    it("handles JSON parse errors", async () => {
      const mockClient = createMockClient(() => ({
        content: [{ type: "text", text: "not valid json" }],
      }));

      const tools = createFootnoteMcpTools(mockClient);
      const result = await executeTool(tools.search_hybrid, { query: "test" }) as {
        source: string;
        results: Array<{ path: string; snippet?: string }>;
      };
      assert.ok(result.results[0].snippet?.includes("not valid json"));
    });
  });

  describe("search_fts", () => {
    it("calls MCP with query", async () => {
      const calls: Array<{ name: string }> = [];
      const mockClient = createMockClient((name) => {
        calls.push({ name });
        return { content: [{ type: "text", text: "[]" }] };
      });

      const tools = createFootnoteMcpTools(mockClient);
      await executeTool(tools.search_fts, { query: "kubernetes" });

      assert.equal(calls[0].name, "search_fts");
    });
  });

  describe("search_literal", () => {
    it("calls MCP with pattern", async () => {
      const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
      const mockClient = createMockClient((name, args) => {
        calls.push({ name, args });
        return { content: [{ type: "text", text: "[]" }] };
      });

      const tools = createFootnoteMcpTools(mockClient);
      await executeTool(tools.search_literal, { pattern: "TODO:" });

      assert.equal(calls[0].name, "search_literal");
      assert.equal(calls[0].args.pattern, "TODO:");
    });
  });

  describe("read_document", () => {
    it("returns document content", async () => {
      const mockClient = createMockClient(() => ({
        content: [{ type: "text", text: "# Document Title\n\nContent here." }],
      }));

      const tools = createFootnoteMcpTools(mockClient);
      const result = await executeTool(tools.read_document, {
        path: "/docs/readme.md",
      }) as {
        source: string;
        path: string;
        content: string;
        length: number;
      };

      assert.equal(result.source, "footnote-mcp");
      assert.equal(result.path, "/docs/readme.md");
      assert.ok(result.content.includes("Document Title"));
      assert.equal(result.length, result.content.length);
    });

    it("handles errors", async () => {
      const mockClient = createMockClient(() => {
        throw new Error("File not found");
      });

      const tools = createFootnoteMcpTools(mockClient);
      const result = await executeTool(tools.read_document, {
        path: "/missing.md",
      }) as { error: boolean; message: string };

      assert.equal(result.error, true);
      assert.ok(result.message.includes("File not found"));
    });
  });
});
