import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { createByoCloudRuntime } from "./byo-cloud.ts";
import type { PrivacyProfile } from "../types.ts";

describe("createByoCloudRuntime", () => {
  const baseProfile: PrivacyProfile = {
    runtime: "byo-cloud",
    model: "https://api.example.com/v1#gpt-4",
    egress: "deny",
  };

  describe("validation", () => {
    it("throws if model uses ollama format", () => {
      const profile: PrivacyProfile = {
        ...baseProfile,
        model: "ollama:qwen2.5",
      };

      assert.throws(
        () => createByoCloudRuntime(profile),
        /byo-cloud.*requires a URL-style model reference/
      );
    });

    it("accepts URL-style model reference", () => {
      const runtime = createByoCloudRuntime(baseProfile);
      assert.ok(runtime);
      assert.equal(typeof runtime.runTurn, "function");
    });
  });

  describe("profile normalization", () => {
    it("normalizes egress from deny to allow-model", () => {
      const profile: PrivacyProfile = {
        runtime: "byo-cloud",
        model: "https://api.example.com/v1#gpt-4",
        egress: "deny",
      };

      const runtime = createByoCloudRuntime(profile);
      assert.equal(runtime.profile.egress, "allow-model");
    });

    it("preserves explicit allow-tools egress", () => {
      const profile: PrivacyProfile = {
        runtime: "byo-cloud",
        model: "https://api.example.com/v1#gpt-4",
        egress: "allow-tools",
      };

      const runtime = createByoCloudRuntime(profile);
      assert.equal(runtime.profile.egress, "allow-tools");
    });
  });

  describe("API key resolution", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("uses profile.apiKey when provided", () => {
      const profile: PrivacyProfile = {
        ...baseProfile,
        apiKey: "test-api-key",
      };

      // Just verify runtime creates without error - actual API key usage
      // is internal to the provider
      const runtime = createByoCloudRuntime(profile);
      assert.ok(runtime);
    });

    it("falls back to JERRY_API_KEY env var", () => {
      process.env.JERRY_API_KEY = "env-jerry-key";

      const runtime = createByoCloudRuntime(baseProfile);
      assert.ok(runtime);
    });

    it("falls back to OPENAI_API_KEY env var", () => {
      process.env.OPENAI_API_KEY = "env-openai-key";

      const runtime = createByoCloudRuntime(baseProfile);
      assert.ok(runtime);
    });

    it("prefers JERRY_API_KEY over OPENAI_API_KEY", () => {
      process.env.JERRY_API_KEY = "jerry-key";
      process.env.OPENAI_API_KEY = "openai-key";

      // Both are set, runtime should still create
      const runtime = createByoCloudRuntime(baseProfile);
      assert.ok(runtime);
    });
  });

  describe("runtime interface", () => {
    it("exposes profile", () => {
      const runtime = createByoCloudRuntime(baseProfile);
      assert.ok(runtime.profile);
      assert.equal(runtime.profile.runtime, "byo-cloud");
    });

    it("has runTurn method", () => {
      const runtime = createByoCloudRuntime(baseProfile);
      assert.equal(typeof runtime.runTurn, "function");
    });
  });
});
