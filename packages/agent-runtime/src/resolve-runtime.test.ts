import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveRuntime } from "./resolve-runtime.ts";
import { DEFAULT_PRIVACY_PROFILE, mergeProfile } from "./profile.ts";

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
    it("throws not implemented error", () => {
      const profile = mergeProfile({
        runtime: "byo-cloud",
        model: "https://api.openai.com/v1#gpt-4o",
      });
      assert.throws(
        () => resolveRuntime(profile),
        /byo-cloud.*not implemented in Phase 0/
      );
    });
  });

  describe("ozwell runtime", () => {
    it("throws not implemented error", () => {
      const profile = mergeProfile({
        runtime: "ozwell",
        endpoint: "https://tryozwell.os.mieweb.org",
      });
      assert.throws(
        () => resolveRuntime(profile),
        /ozwell.*not implemented in Phase 0/
      );
    });

    it("throws if endpoint is missing", () => {
      const profile = mergeProfile({ runtime: "ozwell" });
      assert.throws(
        () => resolveRuntime(profile),
        /requires an "endpoint" field/
      );
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
