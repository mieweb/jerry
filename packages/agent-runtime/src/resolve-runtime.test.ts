import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveRuntime } from "./resolve-runtime.ts";
import { DEFAULT_PRIVACY_PROFILE, DEFAULT_OZWELL_ENDPOINT, mergeProfile } from "./profile.ts";

describe("resolveRuntime", () => {
  describe("local runtime", () => {
    it("returns a runtime for default profile", () => {
      const runtime = resolveRuntime(DEFAULT_PRIVACY_PROFILE);
      assert.ok(runtime);
      assert.equal(runtime.profile.runtime, "local");
    });

    it("returns a runtime when called with no args", () => {
      const runtime = resolveRuntime();
      assert.ok(runtime);
      assert.equal(runtime.profile.runtime, "local");
    });

    it("runtime has runTurn method", () => {
      const runtime = resolveRuntime();
      assert.equal(typeof runtime.runTurn, "function");
    });

    it("runtime exposes the profile", () => {
      const profile = mergeProfile({ model: "ollama:llama3.2" });
      const runtime = resolveRuntime(profile);
      assert.deepEqual(runtime.profile, profile);
    });
  });

  describe("byo-cloud runtime", () => {
    it("returns a runtime for URL-style model", () => {
      const profile = mergeProfile({
        runtime: "byo-cloud",
        model: "https://api.openai.com/v1#gpt-4o",
      });
      const runtime = resolveRuntime(profile);
      assert.ok(runtime);
      assert.equal(runtime.profile.runtime, "byo-cloud");
    });

    it("normalizes egress to allow-model", () => {
      const profile = mergeProfile({
        runtime: "byo-cloud",
        model: "https://api.openai.com/v1#gpt-4o",
        egress: "deny",
      });
      const runtime = resolveRuntime(profile);
      assert.equal(runtime.profile.egress, "allow-model");
    });

    it("throws for ollama-style model", () => {
      const profile = mergeProfile({
        runtime: "byo-cloud",
        model: "ollama:qwen2.5",
      });
      assert.throws(
        () => resolveRuntime(profile),
        /byo-cloud.*requires a URL-style model reference/
      );
    });
  });

  describe("ozwell runtime", () => {
    it("returns a runtime with default endpoint", () => {
      const profile = mergeProfile({
        runtime: "ozwell",
        model: "gpt-4.1-mini",
        apiKey: "ozw_test_key",
      });
      const runtime = resolveRuntime(profile);
      assert.ok(runtime);
      assert.equal(runtime.profile.runtime, "ozwell");
    });

    it("returns a runtime with explicit endpoint", () => {
      const profile = mergeProfile({
        runtime: "ozwell",
        model: "gpt-4.1-mini",
        endpoint: "https://custom.ozwell.example.com",
        apiKey: "ozw_test_key",
      });
      const runtime = resolveRuntime(profile);
      assert.ok(runtime);
    });

    it("uses Manager host as default endpoint", () => {
      // Verify the constant is correct
      assert.equal(DEFAULT_OZWELL_ENDPOINT, "https://ozwellapi.os.mieweb.org");
    });

    it("normalizes egress to allow-model", () => {
      const profile = mergeProfile({
        runtime: "ozwell",
        model: "gpt-4.1-mini",
        egress: "deny",
        apiKey: "ozw_test_key",
      });
      const runtime = resolveRuntime(profile);
      assert.equal(runtime.profile.egress, "allow-model");
    });
  });

  describe("unknown runtime", () => {
    it("throws for unknown runtime", () => {
      const profile = {
        ...DEFAULT_PRIVACY_PROFILE,
        runtime: "unknown" as "local",
      };
      assert.throws(
        () => resolveRuntime(profile),
        /Unknown runtime: "unknown"/
      );
    });
  });
});
