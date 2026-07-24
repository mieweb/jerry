import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import { listAnthropicModels } from "./list-anthropic-models.ts";

describe("listAnthropicModels", () => {
  it("returns live model ids from /v1/models", async () => {
    const mockFetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          { id: "claude-sonnet-4-20250514", display_name: "Claude Sonnet 4" },
          { id: "claude-3-5-haiku-20241022", display_name: "Claude 3.5 Haiku" },
        ],
      }),
    }));

    const result = await listAnthropicModels({
      apiKey: "sk-ant-test",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    assert.equal(result.ok, true);
    assert.equal(result.models.length, 2);
    assert.equal(result.models[0].id, "claude-3-5-haiku-20241022");
    assert.equal(result.models[0].displayName, "Claude 3.5 Haiku");
    assert.equal(result.models[1].id, "claude-sonnet-4-20250514");
    assert.equal(result.models[1].displayName, "Claude Sonnet 4");
  });

  it("returns auth error when API key missing", async () => {
    const result = await listAnthropicModels({ apiKey: "" });
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

    const result = await listAnthropicModels({
      apiKey: "sk-ant-bad",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorKind, "auth");
    assert.equal(result.error, "Invalid API key");
    assert.deepEqual(result.models, []);
  });

  it("returns unavailable error on 500", async () => {
    const mockFetch = mock.fn(async () => ({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    }));

    const result = await listAnthropicModels({
      apiKey: "sk-ant-test",
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

    const result = await listAnthropicModels({
      apiKey: "sk-ant-test",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorKind, "unavailable");
    assert.equal(result.error, "Service unavailable");
  });

  it("sends correct headers including anthropic-version", async () => {
    const mockFetch = mock.fn(async (_url: string, opts: RequestInit) => {
      const headers = opts.headers as Record<string, string>;
      assert.equal(headers["x-api-key"], "sk-ant-test");
      assert.equal(headers["anthropic-version"], "2023-06-01");
      return {
        ok: true,
        json: async () => ({
          data: [{ id: "claude-3-opus-20240229" }],
        }),
      };
    });

    await listAnthropicModels({
      apiKey: "sk-ant-test",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    assert.equal(mockFetch.mock.calls.length, 1);
  });
});
