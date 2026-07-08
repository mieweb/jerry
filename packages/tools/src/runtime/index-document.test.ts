/**
 * Tests for index_document tool.
 */

import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createIndexDocumentTool } from "./index-document.ts";
import { resetEmbedder } from "./embeddings.ts";
import type { ToolContext } from "./types.ts";

let originalFetch: typeof globalThis.fetch;

function createMockVectors() {
  const indexed: Array<{ id: string; values: number[]; metadata: Record<string, string> }> = [];

  return {
    upsert: mock.fn(async (vectors: typeof indexed) => {
      indexed.push(...vectors);
    }),
    query: mock.fn(async () => ({ matches: [] })),
    _indexed: indexed,
  } as unknown as ToolContext["vectors"];
}

function createMockBucket() {
  const store = new Map<string, string>();

  return {
    put: mock.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    get: mock.fn(async () => null),
    _store: store,
  } as unknown as ToolContext["bucket"];
}

function createMockContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "test-session",
    db: {} as ToolContext["db"],
    vectors: undefined,
    bucket: undefined,
    scheduleWake: mock.fn(async () => {}),
    suspendForUser: mock.fn(),
    suspendForApproval: mock.fn(),
    ...overrides,
  };
}

function mockFetchForEmbedding(embedding: number[] | null) {
  globalThis.fetch = mock.fn(async () => {
    if (embedding === null) {
      return {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: async () => ({ error: "Embedding failed" }),
        text: async () => "Embedding failed",
      } as Response;
    }
    return {
      ok: true,
      json: async () => ({ embedding }),
    } as Response;
  });
}

describe("index_document tool", () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    resetEmbedder(); // Reset cached embedder for each test
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    resetEmbedder();
  });

  it("returns error when vectors binding is not available", async () => {
    const ctx = createMockContext({ vectors: undefined });
    const tool = createIndexDocumentTool(ctx);

    const result = await tool.execute(
      { path: "/test.txt", content: "Hello world" },
      { toolCallId: "1", messages: [] }
    );

    assert.equal(result.error, true);
    assert.ok(result.message?.includes("not available"));
    assert.equal(result.indexed, false);
  });

  it("returns error when embedding generation fails", async () => {
    mockFetchForEmbedding(null);

    const vectors = createMockVectors();
    const ctx = createMockContext({ vectors });
    const tool = createIndexDocumentTool(ctx);

    const result = await tool.execute(
      { path: "/test.txt", content: "Hello world" },
      { toolCallId: "1", messages: [] }
    );

    assert.equal(result.error, true);
    assert.ok(result.message?.includes("embedding"));
    assert.equal(result.indexed, false);
  });

  it("indexes document with generated embedding", async () => {
    const fakeEmbedding = new Array(768).fill(0).map((_, i) => i / 768);
    mockFetchForEmbedding(fakeEmbedding);

    const vectors = createMockVectors();
    const bucket = createMockBucket();
    const ctx = createMockContext({ vectors, bucket });
    const tool = createIndexDocumentTool(ctx);

    const result = await tool.execute(
      { path: "/test.txt", content: "Hello world", metadata: { title: "Test Doc" } },
      { toolCallId: "1", messages: [] }
    );

    assert.equal(result.error, false);
    assert.equal(result.indexed, true);
    assert.ok(result.id);
    assert.equal(result.embeddingDimensions, 768);

    // Check that vectors.upsert was called
    const indexed = (vectors as unknown as { _indexed: Array<{ values: number[]; metadata: Record<string, string> }> })._indexed;
    assert.equal(indexed.length, 1);
    assert.equal(indexed[0].values.length, 768);
    assert.equal(indexed[0].metadata.title, "Test Doc");

    // Check that bucket.put was called
    const store = (bucket as unknown as { _store: Map<string, string> })._store;
    assert.equal(store.get("/test.txt"), "Hello world");
  });

  it("generates consistent IDs for the same path", async () => {
    const fakeEmbedding = new Array(768).fill(0.5);
    mockFetchForEmbedding(fakeEmbedding);

    const vectors = createMockVectors();
    const ctx = createMockContext({ vectors });
    const tool = createIndexDocumentTool(ctx);

    const result1 = await tool.execute(
      { path: "/test.txt", content: "Content 1" },
      { toolCallId: "1", messages: [] }
    );

    const result2 = await tool.execute(
      { path: "/test.txt", content: "Content 2" },
      { toolCallId: "2", messages: [] }
    );

    assert.equal(result1.id, result2.id);
  });

  it("works without bucket binding", async () => {
    const fakeEmbedding = new Array(768).fill(0.5);
    mockFetchForEmbedding(fakeEmbedding);

    const vectors = createMockVectors();
    const ctx = createMockContext({ vectors, bucket: undefined });
    const tool = createIndexDocumentTool(ctx);

    const result = await tool.execute(
      { path: "/test.txt", content: "Hello world" },
      { toolCallId: "1", messages: [] }
    );

    assert.equal(result.error, false);
    assert.equal(result.indexed, true);
  });
});
