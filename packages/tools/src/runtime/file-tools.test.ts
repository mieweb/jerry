/**
 * Tests for file tools (read_file and list_watched).
 */

import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { createReadFileTool, createListWatchedTool } from "./file-tools.ts";
import type { ToolContext } from "./types.ts";

function createMockBucket(): ToolContext["bucket"] {
  const store = new Map<string, { content: string; size: number }>();

  return {
    get: mock.fn(async (key: string) => {
      const item = store.get(key);
      if (!item) return null;
      return {
        text: async () => item.content,
        size: item.size,
      };
    }),
    put: mock.fn(async (key: string, value: string) => {
      store.set(key, { content: value, size: value.length });
    }),
    delete: mock.fn(async () => {}),
    _store: store,
  } as unknown as ToolContext["bucket"];
}

function createMockDb(rows: Array<{ payload: string; occurred_at: string }> = []) {
  return {
    prepare: mock.fn(() => ({
      bind: mock.fn(() => ({
        all: mock.fn(async () => ({ results: rows })),
      })),
    })),
  } as unknown as ToolContext["db"];
}

function createMockContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "test-session",
    db: createMockDb(),
    vectors: undefined,
    bucket: undefined,
    scheduleWake: mock.fn(async () => {}),
    suspendForUser: mock.fn(),
    suspendForApproval: mock.fn(),
    ...overrides,
  };
}

describe("read_file tool", () => {
  it("returns error when bucket is not available", async () => {
    const ctx = createMockContext({ bucket: undefined });
    const tool = createReadFileTool(ctx);

    const result = await tool.execute({ path: "/test.txt" }, { toolCallId: "1" });

    assert.equal(result.error, true);
    assert.ok(result.message?.includes("not available"));
  });

  it("returns error when file is not found", async () => {
    const bucket = createMockBucket();
    const ctx = createMockContext({ bucket });
    const tool = createReadFileTool(ctx);

    const result = await tool.execute({ path: "/nonexistent.txt" }, { toolCallId: "1" });

    assert.equal(result.error, true);
    assert.ok(result.message?.includes("not found"));
  });

  it("reads file content from bucket", async () => {
    const bucket = createMockBucket();
    // Pre-populate the store
    (bucket as unknown as { _store: Map<string, unknown> })._store.set("/test.txt", {
      content: "Hello, World!",
      size: 13,
    });

    const ctx = createMockContext({ bucket });
    const tool = createReadFileTool(ctx);

    const result = await tool.execute({ path: "/test.txt" }, { toolCallId: "1" });

    assert.equal(result.error, false);
    assert.equal(result.content, "Hello, World!");
    assert.equal(result.size, 13);
    assert.equal(result.path, "/test.txt");
  });
});

describe("list_watched tool", () => {
  it("returns empty list when no files found", async () => {
    const ctx = createMockContext();
    const tool = createListWatchedTool(ctx);

    const result = await tool.execute({ limit: 20 }, { toolCallId: "1" });

    assert.equal(result.error, false);
    assert.deepEqual(result.files, []);
  });

  it("returns watched files from activity_events", async () => {
    const rows = [
      {
        payload: JSON.stringify({
          path: "/Users/me/notes.md",
          name: "notes.md",
          extension: ".md",
          size: 1024,
        }),
        occurred_at: "2024-01-15T10:00:00Z",
      },
      {
        payload: JSON.stringify({
          path: "/Users/me/screenshot.png",
          name: "screenshot.png",
          extension: ".png",
          size: 50000,
        }),
        occurred_at: "2024-01-15T09:00:00Z",
      },
    ];

    const db = createMockDb(rows);
    const ctx = createMockContext({ db });
    const tool = createListWatchedTool(ctx);

    const result = await tool.execute({ limit: 10 }, { toolCallId: "1" });

    assert.equal(result.error, false);
    assert.equal(result.count, 2);
    assert.equal(result.files.length, 2);
    assert.equal(result.files[0].name, "notes.md");
    assert.equal(result.files[1].name, "screenshot.png");
  });

  it("deduplicates files by path", async () => {
    const rows = [
      {
        payload: JSON.stringify({ path: "/Users/me/notes.md", name: "notes.md", extension: ".md", size: 1024 }),
        occurred_at: "2024-01-15T10:00:00Z",
      },
      {
        payload: JSON.stringify({ path: "/Users/me/notes.md", name: "notes.md", extension: ".md", size: 1024 }),
        occurred_at: "2024-01-15T09:00:00Z",
      },
    ];

    const db = createMockDb(rows);
    const ctx = createMockContext({ db });
    const tool = createListWatchedTool(ctx);

    const result = await tool.execute({ limit: 10 }, { toolCallId: "1" });

    assert.equal(result.error, false);
    assert.equal(result.count, 1);
  });

  it("respects limit parameter", async () => {
    const rows = [
      { payload: JSON.stringify({ path: "/a.txt", name: "a.txt" }), occurred_at: "2024-01-15T10:00:00Z" },
      { payload: JSON.stringify({ path: "/b.txt", name: "b.txt" }), occurred_at: "2024-01-15T09:00:00Z" },
      { payload: JSON.stringify({ path: "/c.txt", name: "c.txt" }), occurred_at: "2024-01-15T08:00:00Z" },
    ];

    const db = createMockDb(rows);
    const ctx = createMockContext({ db });
    const tool = createListWatchedTool(ctx);

    const result = await tool.execute({ limit: 2 }, { toolCallId: "1" });

    assert.equal(result.count, 2);
  });
});
