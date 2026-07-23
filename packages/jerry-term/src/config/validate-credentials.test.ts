import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { validateCredentials } from "./validate-credentials.ts";

describe("validateCredentials", () => {
  it("returns valid:true for local runtime", async () => {
    const result = await validateCredentials("local", undefined, "");
    assert.equal(result.valid, true);
  });

  it("returns valid:false for invalid OpenAI key", async () => {
    const result = await validateCredentials(
      "byo-cloud",
      "openai",
      "sk_invalid",
      "https://api.openai.com/v1"
    );
    // Mock will return an error, so expect invalid
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes("Invalid OpenAI API key"));
  });

  it("returns valid:false for invalid Anthropic key", async () => {
    const result = await validateCredentials(
      "anthropic",
      "anthropic",
      "sk-ant-invalid"
    );
    assert.equal(result.valid, false);
    assert.ok(result.error?.includes("Invalid Anthropic API key"));
  });

  it("returns valid:true for Ozwell (has fallback, cannot validate)", async () => {
    const result = await validateCredentials("ozwell", undefined, "ozw_anykey");
    assert.equal(result.valid, true);
  });

  it("returns valid:true for custom providers (cannot validate)", async () => {
    const result = await validateCredentials(
      "byo-cloud",
      "custom",
      "any-key",
      "https://custom.api/v1"
    );
    assert.equal(result.valid, true);
  });
});
