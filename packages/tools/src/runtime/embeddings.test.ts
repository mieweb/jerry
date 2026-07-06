/**
 * Tests for embeddings module (using footnote embedder).
 */

import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getEmbedding, isOllamaAvailable, resetEmbedder } from "./embeddings.ts";

let originalFetch: typeof globalThis.fetch;

describe("getEmbedding (footnote embedder)", () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
    resetEmbedder(); // Reset cached embedder for each test
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    resetEmbedder();
  });

  it("returns embedding from successful Ollama response", async () => {
    const expectedEmbedding = new Array(768).fill(0).map((_, i) => i / 768);

    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({ embedding: expectedEmbedding }),
    })) as typeof fetch;

    const result = await getEmbedding("test query");

    assert.ok(result);
    assert.equal(result.length, 768);
    assert.deepEqual(result, expectedEmbedding);
  });

  it("returns null on HTTP error", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => ({ error: "Server error" }),
    })) as typeof fetch;

    const result = await getEmbedding("test query");

    assert.equal(result, null);
  });

  it("returns null on network error", async () => {
    globalThis.fetch = mock.fn(async () => {
      throw new Error("Connection refused");
    }) as typeof fetch;

    const result = await getEmbedding("test query");

    assert.equal(result, null);
  });

  it("uses custom base URL", async () => {
    let calledUrl = "";
    globalThis.fetch = mock.fn(async (url: string | URL | Request) => {
      calledUrl = typeof url === "string" ? url : url.toString();
      return {
        ok: true,
        json: async () => ({ embedding: [1, 2, 3] }),
      };
    }) as typeof fetch;

    await getEmbedding("test", { baseUrl: "http://custom:11434" });

    assert.ok(calledUrl.startsWith("http://custom:11434"));
  });

  it("uses custom model", async () => {
    let requestBody = "";
    globalThis.fetch = mock.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = init?.body as string;
      return {
        ok: true,
        json: async () => ({ embedding: [1, 2, 3] }),
      };
    }) as typeof fetch;

    await getEmbedding("test", { model: "mxbai-embed-large", dimension: 1024 });

    const parsed = JSON.parse(requestBody);
    assert.equal(parsed.model, "mxbai-embed-large");
  });
});

describe("isOllamaAvailable", () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns true when Ollama is reachable", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
    })) as typeof fetch;

    const result = await isOllamaAvailable();

    assert.equal(result, true);
  });

  it("returns false when Ollama is not reachable", async () => {
    globalThis.fetch = mock.fn(async () => {
      throw new Error("Connection refused");
    }) as typeof fetch;

    const result = await isOllamaAvailable();

    assert.equal(result, false);
  });

  it("returns false on HTTP error", async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: false,
      status: 503,
    })) as typeof fetch;

    const result = await isOllamaAvailable();

    assert.equal(result, false);
  });
});

describe("Ollama embeddings integration", () => {
  const shouldRun = process.env.JERRY_OLLAMA_TEST === "1";

  beforeEach(() => {
    resetEmbedder();
  });

  afterEach(() => {
    resetEmbedder();
  });

  it("generates real embedding from Ollama", { skip: !shouldRun }, async () => {
    const result = await getEmbedding("Hello, this is a test document for embedding.");

    assert.ok(result, "Should return an embedding");
    assert.equal(result.length, 768, "nomic-embed-text produces 768-dim vectors");

    // Check it's a valid normalized-ish vector
    const magnitude = Math.sqrt(result.reduce((sum, v) => sum + v * v, 0));
    assert.ok(magnitude > 0, "Vector should have non-zero magnitude");
  });

  it("generates different embeddings for different texts", { skip: !shouldRun }, async () => {
    const result1 = await getEmbedding("The quick brown fox jumps over the lazy dog.");
    const result2 = await getEmbedding("Machine learning is a subset of artificial intelligence.");

    assert.ok(result1);
    assert.ok(result2);

    // Calculate cosine similarity - different texts should have different embeddings
    let dotProduct = 0;
    for (let i = 0; i < result1.length; i++) {
      dotProduct += result1[i] * result2[i];
    }

    // Similarity should be less than 1 (not identical)
    assert.ok(dotProduct < 0.99, "Different texts should have different embeddings");
  });
});
