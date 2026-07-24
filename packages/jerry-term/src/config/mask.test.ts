import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { maskApiKey } from "./mask.ts";

describe("maskApiKey", () => {
  it("masks keys with first 4 and last 4 characters", () => {
    const result = maskApiKey("sk-proj-abc123xyz");
    assert.equal(result, "sk-p****3xyz");
  });

  it("masks Anthropic keys correctly", () => {
    const result = maskApiKey("sk-ant-api03-abcdefgh");
    assert.equal(result, "sk-a****efgh");
  });

  it("returns **** for short keys", () => {
    assert.equal(maskApiKey("short"), "****");
    assert.equal(maskApiKey("1234567"), "****");
  });

  it("returns **** for exactly 8 character keys", () => {
    const result = maskApiKey("12345678");
    assert.equal(result, "1234****5678");
  });

  it("returns **** for undefined input", () => {
    assert.equal(maskApiKey(undefined), "****");
  });

  it("returns **** for empty string", () => {
    assert.equal(maskApiKey(""), "****");
  });

  it("handles 9-character keys", () => {
    const result = maskApiKey("123456789");
    assert.equal(result, "1234****6789");
  });
});
