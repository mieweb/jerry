/**
 * Tests for summarize_activity — on-demand ActivityWatch historical fetch.
 */

import { describe, it, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createSummarizeActivityTool } from "./summarize-activity.ts";
import type { ToolContext } from "./types.ts";

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response;
}

function createMockDb(
  rows: Array<{
    id?: string;
    source?: string;
    payload?: string | null;
    occurred_at: string;
  }> = []
) {
  return {
    prepare: mock.fn(() => ({
      bind: mock.fn(() => ({
        all: mock.fn(async () => ({
          results: rows.map((row, i) => ({
            id: row.id ?? `row-${i}`,
            source: row.source ?? "aw",
            payload: row.payload ?? null,
            occurred_at: row.occurred_at,
          })),
        })),
        run: mock.fn(async () => ({})),
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

describe("summarize_activity tool", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches a historical calendar day live from ActivityWatch", async () => {
    globalThis.fetch = mock.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/0/info")) return jsonResponse({});
      if (url.endsWith("/api/0/buckets/")) {
        return jsonResponse({
          "aw-watcher-window_host": {
            id: "aw-watcher-window_host",
            type: "currentwindow",
          },
        });
      }
      if (url.includes("/events?")) {
        assert.match(url, /2026-06-26/);
        return jsonResponse([
          {
            timestamp: "2026-06-26T15:00:00.000Z",
            duration: 600,
            data: { app: "Code", title: "historical.ts" },
          },
        ]);
      }
      return jsonResponse({}, false);
    }) as unknown as typeof fetch;

    const tool = createSummarizeActivityTool(createMockContext());
    const result = await tool.execute(
      { range: "2026-06-26" },
      { toolCallId: "1", messages: [] }
    );

    assert.equal(result.error, false);
    assert.equal(result.dataSource, "activitywatch");
    assert.ok(result.summary);
    assert.ok((result.summary?.totalEventCount ?? 0) >= 1);
    assert.ok(result.formatted?.includes("Code") || result.formatted?.includes("historical"));
  });

  it("falls back to Jerry DB when ActivityWatch is unreachable", async () => {
    globalThis.fetch = mock.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    const payload = JSON.stringify({
      bucketId: "aw-watcher-window_host",
      events: [
        {
          timestamp: "2026-07-22T12:00:00.000Z",
          duration: 300,
          data: { app: "Safari", title: "notes" },
        },
      ],
    });

    const db = createMockDb([
      {
        source: "aw",
        payload,
        occurred_at: "2026-07-22T12:00:00.000Z",
      },
    ]);

    const tool = createSummarizeActivityTool(createMockContext({ db }));
    const result = await tool.execute(
      { range: "July 22 2026" },
      { toolCallId: "2", messages: [] }
    );

    assert.equal(result.error, false);
    assert.equal(result.dataSource, "jerry-db");
    assert.ok(result.summary);
  });

  it("reports no evidence when AW is up but the range is empty", async () => {
    globalThis.fetch = mock.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/0/info")) return jsonResponse({});
      if (url.endsWith("/api/0/buckets/")) {
        return jsonResponse({
          "aw-watcher-window_host": {
            id: "aw-watcher-window_host",
            type: "currentwindow",
          },
        });
      }
      return jsonResponse([]);
    }) as unknown as typeof fetch;

    const tool = createSummarizeActivityTool(createMockContext());
    const result = await tool.execute(
      { range: "2020-01-01" },
      { toolCallId: "3", messages: [] }
    );

    assert.equal(result.error, false);
    assert.equal(result.summary, null);
    assert.match(String(result.message), /No evidence from ActivityWatch/);
  });
});
