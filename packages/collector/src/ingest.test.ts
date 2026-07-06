/**
 * Tests for ingest module.
 */

import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ingestFile, shouldIndex } from "./ingest.ts";

let originalFetch: typeof globalThis.fetch;

describe("shouldIndex", () => {
  it("returns true for text files under size limit", () => {
    assert.equal(shouldIndex(".txt", 1000), true);
    assert.equal(shouldIndex(".md", 50000), true);
    assert.equal(shouldIndex(".json", 100 * 1024), true);
  });

  it("returns false for non-text files", () => {
    assert.equal(shouldIndex(".png", 1000), false);
    assert.equal(shouldIndex(".jpg", 1000), false);
    assert.equal(shouldIndex(".exe", 1000), false);
  });

  it("returns false for files over size limit", () => {
    assert.equal(shouldIndex(".txt", 100 * 1024 + 1), false);
    assert.equal(shouldIndex(".md", 200 * 1024), false);
  });

  it("respects custom size limit", () => {
    assert.equal(shouldIndex(".txt", 1000, 500), false);
    assert.equal(shouldIndex(".txt", 1000, 2000), true);
  });

  it("handles case-insensitive extensions", () => {
    assert.equal(shouldIndex(".TXT", 1000), true);
    assert.equal(shouldIndex(".MD", 1000), true);
    assert.equal(shouldIndex(".JSON", 1000), true);
  });
});

describe("ingestFile", () => {
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("uploads file and triggers indexing", async () => {
    const calls: Array<{ url: string; method: string }> = [];

    globalThis.fetch = mock.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      calls.push({ url: urlStr, method: init?.method ?? "GET" });
      return { ok: true, text: async () => "" } as Response;
    });

    const result = await ingestFile("/path/to/file.txt", "Hello world");

    assert.equal(result.success, true);
    assert.equal(result.uploaded, true);
    assert.equal(result.indexed, true);

    // Should have made 2 calls: PUT for upload, POST for index
    assert.equal(calls.length, 2);
    assert.ok(calls[0].url.includes("/v1/files/"));
    assert.equal(calls[0].method, "PUT");
    assert.ok(calls[1].url.includes("/v1/index"));
    assert.equal(calls[1].method, "POST");
  });

  it("continues indexing even if upload fails", async () => {
    let callCount = 0;

    globalThis.fetch = mock.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return { ok: false, status: 500, statusText: "Error" } as Response;
      }
      return { ok: true, text: async () => "" } as Response;
    });

    const result = await ingestFile("/path/to/file.txt", "Hello world");

    assert.equal(result.success, true);
    assert.equal(result.uploaded, false);
    assert.equal(result.indexed, true);
  });

  it("returns error if indexing fails", async () => {
    globalThis.fetch = mock.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/v1/index")) {
        return { ok: false, status: 500, text: async () => "Index error" } as Response;
      }
      return { ok: true } as Response;
    });

    const result = await ingestFile("/path/to/file.txt", "Hello world");

    assert.equal(result.success, false);
    assert.equal(result.indexed, false);
    assert.ok(result.error?.includes("Indexing failed"));
  });

  it("uses custom Jerry URL", async () => {
    let calledUrl = "";

    globalThis.fetch = mock.fn(async (url: string | URL | Request) => {
      calledUrl = typeof url === "string" ? url : url.toString();
      return { ok: true, text: async () => "" } as Response;
    });

    await ingestFile("/test.txt", "content", { jerryUrl: "http://custom:9999" });

    assert.ok(calledUrl.startsWith("http://custom:9999"));
  });

  it("handles network errors gracefully", async () => {
    globalThis.fetch = mock.fn(async () => {
      throw new Error("Connection refused");
    });

    const result = await ingestFile("/test.txt", "content");

    assert.equal(result.success, false);
    assert.ok(result.error?.includes("Ingest error"));
  });
});
