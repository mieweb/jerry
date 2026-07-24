import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import { listOzwellModels } from "./list-ozwell-models.ts";

describe("listOzwellModels", () => {
  it("returns live model ids from /v1/models", async () => {
    const mockFetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [{ id: "gpt-4o" }, { id: "claude-3-5-sonnet" }],
      }),
    }));

    const result = await listOzwellModels({
      apiKey: "ozw_test",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    assert.equal(result.ok, true);
    assert.equal(result.usedFallback, false);
    assert.deepEqual(result.models, ["claude-3-5-sonnet", "gpt-4o"]);
  });

  it("falls back to curated list when API key missing", async () => {
    const result = await listOzwellModels({ apiKey: "" });
    assert.equal(result.ok, false);
    assert.equal(result.usedFallback, true);
    assert.ok(result.models.length > 0);
    assert.ok(result.models.includes("gpt-4.1-mini"));
  });

  it("falls back to curated list on HTTP error", async () => {
    const mockFetch = mock.fn(async () => ({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    }));

    const result = await listOzwellModels({
      apiKey: "ozw_bad",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    assert.equal(result.ok, false);
    assert.equal(result.usedFallback, true);
    assert.match(result.error ?? "", /401/);
    assert.ok(result.models.includes("gpt-4.1-mini"));
  });

  it("falls back when response has empty data", async () => {
    const mockFetch = mock.fn(async () => ({
      ok: true,
      json: async () => ({ data: [] }),
    }));

    const result = await listOzwellModels({
      apiKey: "ozw_test",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    assert.equal(result.ok, false);
    assert.equal(result.usedFallback, true);
    assert.ok(result.models.length > 0);
  });
});
