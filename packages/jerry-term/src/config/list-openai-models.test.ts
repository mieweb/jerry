import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import { listOpenAIModels } from "./list-openai-models.ts";

describe("listOpenAIModels", () => {
  it("returns live model ids from /v1/models", async () => {
    const mockFetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }, { id: "gpt-3.5-turbo" }],
      }),
    }));

    const result = await listOpenAIModels({
      apiKey: "sk-test123",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.models, ["gpt-3.5-turbo", "gpt-4o", "gpt-4o-mini"]);
    assert.equal(result.errorKind, undefined);
  });

  it("returns auth error when API key missing", async () => {
    const result = await listOpenAIModels({ apiKey: "" });
    assert.equal(result.ok, false);
    assert.equal(result.errorKind, "auth");
    assert.deepEqual(result.models, []);
  });

  it("returns auth error on 401", async () => {
    const mockFetch = mock.fn(async () => ({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    }));

    const result = await listOpenAIModels({
      apiKey: "sk-bad",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorKind, "auth");
    assert.equal(result.error, "Invalid API key");
    assert.deepEqual(result.models, []);
  });

  it("returns auth error on 403", async () => {
    const mockFetch = mock.fn(async () => ({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    }));

    const result = await listOpenAIModels({
      apiKey: "sk-bad",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorKind, "auth");
    assert.equal(result.error, "Invalid API key");
  });

  it("returns unavailable error on 500", async () => {
    const mockFetch = mock.fn(async () => ({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    }));

    const result = await listOpenAIModels({
      apiKey: "sk-test",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorKind, "unavailable");
    assert.equal(result.error, "Service unavailable");
  });

  it("returns unavailable error on network failure", async () => {
    const mockFetch = mock.fn(async () => {
      throw new Error("fetch failed");
    });

    const result = await listOpenAIModels({
      apiKey: "sk-test",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorKind, "unavailable");
    assert.equal(result.error, "Service unavailable");
  });

  it("returns other error when response has empty data", async () => {
    const mockFetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({ data: [] }),
    }));

    const result = await listOpenAIModels({
      apiKey: "sk-test",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorKind, "other");
    assert.deepEqual(result.models, []);
  });
});
