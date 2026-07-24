import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import {
  createLocalTools,
  createLocalToolContext,
  createLocalSummarizeActivityTool,
  DEFAULT_AW_URL,
} from "./index.ts";

function createMockFetch(
  responses: Array<{
    pattern: string;
    exact?: boolean;
    response: { ok: boolean; json: () => unknown };
  }>
) {
  return mock.fn((url: string) => {
    const urlObj = new URL(url);
    const path = urlObj.pathname;

    for (const { pattern, exact, response } of responses) {
      if (exact ? path === pattern : path.includes(pattern)) {
        return Promise.resolve(response as Response);
      }
    }

    return Promise.resolve({
      ok: false,
      json: () => Promise.resolve({}),
    } as Response);
  });
}

describe("LocalToolContext", () => {
  it("createLocalToolContext uses defaults", () => {
    const ctx = createLocalToolContext();
    assert.equal(ctx.awUrl, DEFAULT_AW_URL);
    assert.equal(ctx.fetchFn, fetch);
  });

  it("createLocalToolContext accepts overrides", () => {
    const customFetch = mock.fn(() => Promise.resolve(new Response()));
    const ctx = createLocalToolContext({
      awUrl: "http://custom:1234",
      fetchFn: customFetch as unknown as typeof fetch,
    });
    assert.equal(ctx.awUrl, "http://custom:1234");
    assert.equal(ctx.fetchFn, customFetch);
  });
});

describe("createLocalTools", () => {
  it("returns expected tool set", () => {
    const mockFetch = mock.fn(() => Promise.resolve(new Response()));
    const tools = createLocalTools({ fetchFn: mockFetch as unknown as typeof fetch });

    assert.ok(tools.summarize_activity, "summarize_activity should be defined");
    assert.ok(tools.search_memory, "search_memory should be defined");
    assert.ok(tools.schedule_followup, "schedule_followup should be defined");
    assert.ok(tools.read_file, "read_file should be defined");
    assert.ok(tools.list_watched, "list_watched should be defined");
    assert.ok(tools.index_document, "index_document should be defined");
  });
});

describe("summarize_activity tool", () => {
  const mockBuckets = {
    "aw-watcher-window_test": {
      id: "aw-watcher-window_test",
      type: "test",
      hostname: "test",
      created: "2024-01-01T00:00:00Z",
    },
    "aw-watcher-afk_test": {
      id: "aw-watcher-afk_test",
      type: "afkstatus",
      hostname: "test",
      created: "2024-01-01T00:00:00Z",
    },
  };

  const mockWindowEvents = [
    {
      timestamp: new Date().toISOString(),
      duration: 600,
      data: { app: "Visual Studio Code", title: "index.ts" },
    },
    {
      timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      duration: 300,
      data: { app: "Firefox", title: "GitHub" },
    },
  ];

  const mockAfkEvents = [
    {
      timestamp: new Date().toISOString(),
      duration: 60,
      data: { status: "not-afk" },
    },
  ];

  it("fetches and formats activity summary for today", async () => {
    const mockFetch = createMockFetch([
      {
        pattern: "aw-watcher-window",
        response: {
          ok: true,
          json: () => Promise.resolve(mockWindowEvents),
        },
      },
      {
        pattern: "aw-watcher-afk",
        response: {
          ok: true,
          json: () => Promise.resolve(mockAfkEvents),
        },
      },
      {
        pattern: "/api/0/buckets",
        exact: true,
        response: {
          ok: true,
          json: () => Promise.resolve(mockBuckets),
        },
      },
    ]);

    const ctx = createLocalToolContext({
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    const tool = createLocalSummarizeActivityTool(ctx);

    const result = await tool.execute(
      { timeRange: "today" },
      { toolCallId: "test-1", messages: [], abortSignal: undefined as never }
    );

    assert.equal(typeof result, "string");
    assert.match(result as string, /ActivityWatch/);
    assert.ok(mockFetch.mock.callCount() > 0, "fetch should be called");
  });

  it("handles ActivityWatch not running", async () => {
    const failingFetch = mock.fn(() =>
      Promise.reject(new Error("fetch failed: ECONNREFUSED"))
    );
    const failCtx = createLocalToolContext({
      fetchFn: failingFetch as unknown as typeof fetch,
    });

    const tool = createLocalSummarizeActivityTool(failCtx);
    const result = await tool.execute(
      { timeRange: "today" },
      { toolCallId: "test-2", messages: [], abortSignal: undefined as never }
    );

    assert.match(result as string, /not running/);
  });

  it("handles HTTP error from ActivityWatch", async () => {
    const errorFetch = mock.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
      } as Response)
    );
    const errorCtx = createLocalToolContext({
      fetchFn: errorFetch as unknown as typeof fetch,
    });

    const tool = createLocalSummarizeActivityTool(errorCtx);
    const result = await tool.execute(
      { timeRange: "today" },
      { toolCallId: "test-3", messages: [], abortSignal: undefined as never }
    );

    assert.match(result as string, /not responding/);
  });

  it("handles empty buckets", async () => {
    const emptyFetch = mock.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response)
    );
    const emptyCtx = createLocalToolContext({
      fetchFn: emptyFetch as unknown as typeof fetch,
    });

    const tool = createLocalSummarizeActivityTool(emptyCtx);
    const result = await tool.execute(
      { timeRange: "today" },
      { toolCallId: "test-4", messages: [], abortSignal: undefined as never }
    );

    assert.match(result as string, /No ActivityWatch buckets/);
  });
});

describe("stub tools", () => {
  const tools = createLocalTools();

  it("search_memory returns helpful stub message", async () => {
    const searchTool = tools.search_memory;
    assert.ok(searchTool, "search_memory tool should exist");
    assert.ok(searchTool.execute, "search_memory.execute should exist");

    const result = await searchTool.execute(
      { query: "test query" },
      { toolCallId: "stub-1", messages: [], abortSignal: undefined as never }
    );

    assert.match(result as string, /not available in local mode/);
    assert.match(result as string, /\/runtime ozwell/);
  });

  it("schedule_followup returns helpful stub message", async () => {
    const scheduleTool = tools.schedule_followup;
    assert.ok(scheduleTool, "schedule_followup tool should exist");
    assert.ok(scheduleTool.execute, "schedule_followup.execute should exist");

    const result = await scheduleTool.execute(
      { message: "remind me", when: "tomorrow" },
      { toolCallId: "stub-2", messages: [], abortSignal: undefined as never }
    );

    assert.match(result as string, /not available in local mode/);
    assert.match(result as string, /Durable Objects/);
    assert.match(result as string, /\/runtime ozwell/);
  });

  it("read_file returns helpful stub message", async () => {
    const readTool = tools.read_file;
    assert.ok(readTool, "read_file tool should exist");
    assert.ok(readTool.execute, "read_file.execute should exist");

    const result = await readTool.execute(
      { path: "/test/file.txt" },
      { toolCallId: "stub-3", messages: [], abortSignal: undefined as never }
    );

    assert.match(result as string, /not available in local mode/);
    assert.match(result as string, /R2 bucket/);
  });

  it("list_watched returns helpful stub message", async () => {
    const listTool = tools.list_watched;
    assert.ok(listTool, "list_watched tool should exist");
    assert.ok(listTool.execute, "list_watched.execute should exist");

    const result = await listTool.execute(
      { folder: "test" },
      { toolCallId: "stub-4", messages: [], abortSignal: undefined as never }
    );

    assert.match(result as string, /not available in local mode/);
  });

  it("index_document returns helpful stub message", async () => {
    const indexTool = tools.index_document;
    assert.ok(indexTool, "index_document tool should exist");
    assert.ok(indexTool.execute, "index_document.execute should exist");

    const result = await indexTool.execute(
      { content: "test content" },
      { toolCallId: "stub-5", messages: [], abortSignal: undefined as never }
    );

    assert.match(result as string, /not available in local mode/);
    assert.match(result as string, /vector embeddings/);
  });
});
