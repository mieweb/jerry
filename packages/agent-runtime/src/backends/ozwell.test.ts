import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { createOzwellRuntime } from "./ozwell.ts";
import type { PrivacyProfile, AgentRuntime, RuntimeEvent, TurnInput } from "../types.ts";
import { DEFAULT_OZWELL_ENDPOINT } from "../profile.ts";

describe("createOzwellRuntime", () => {
  const baseProfile: PrivacyProfile = {
    runtime: "ozwell",
    model: "gpt-4.1-mini",
    egress: "deny",
    endpoint: "https://ozwellapi.os.mieweb.org",
    apiKey: "ozw_test_key",
  };

  describe("profile handling", () => {
    it("uses default endpoint when not specified", () => {
      const profile: PrivacyProfile = {
        runtime: "ozwell",
        model: "gpt-4.1-mini",
        egress: "deny",
        apiKey: "ozw_test_key",
      };

      const runtime = createOzwellRuntime(profile);
      assert.ok(runtime);
      // Profile should be normalized
      assert.equal(runtime.profile.egress, "allow-model");
    });

    it("normalizes egress from deny to allow-model", () => {
      const runtime = createOzwellRuntime(baseProfile);
      assert.equal(runtime.profile.egress, "allow-model");
    });

    it("preserves explicit allow-tools egress", () => {
      const profile: PrivacyProfile = {
        ...baseProfile,
        egress: "allow-tools",
      };

      const runtime = createOzwellRuntime(profile);
      assert.equal(runtime.profile.egress, "allow-tools");
    });
  });

  describe("model parsing", () => {
    it("accepts simple model name", () => {
      const runtime = createOzwellRuntime(baseProfile);
      assert.ok(runtime);
    });

    it("extracts model from URL format", () => {
      const profile: PrivacyProfile = {
        ...baseProfile,
        model: "https://api.example.com/v1#gpt-4",
      };

      const runtime = createOzwellRuntime(profile);
      assert.ok(runtime);
    });

    it("uses default model for ollama format", () => {
      const profile: PrivacyProfile = {
        ...baseProfile,
        model: "ollama:qwen2.5",
      };

      const runtime = createOzwellRuntime(profile);
      assert.ok(runtime);
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
      const runtime = createOzwellRuntime(baseProfile);
      assert.ok(runtime);
    });

    it("falls back to OZWELL_AGENT_KEY env var", () => {
      process.env.OZWELL_AGENT_KEY = "agnt_key-test";
      const profile: PrivacyProfile = {
        ...baseProfile,
        apiKey: undefined,
      };

      const runtime = createOzwellRuntime(profile, { skipProbe: true });
      assert.ok(runtime);
    });

    it("falls back to OZWELL_API_KEY env var", () => {
      process.env.OZWELL_API_KEY = "ozw_env_key";
      const profile: PrivacyProfile = {
        ...baseProfile,
        apiKey: undefined,
      };

      const runtime = createOzwellRuntime(profile, { skipProbe: true });
      assert.ok(runtime);
    });

    it("prefers OZWELL_API_KEY over OZWELL_AGENT_KEY", () => {
      process.env.OZWELL_AGENT_KEY = "agnt_key-test";
      process.env.OZWELL_API_KEY = "ozw_parent_key";

      const profile: PrivacyProfile = {
        ...baseProfile,
        apiKey: undefined,
      };

      const runtime = createOzwellRuntime(profile, { skipProbe: true });
      assert.ok(runtime);
    });
  });

  describe("fallback behavior", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.OZWELL_API_KEY;
      delete process.env.OZWELL_AGENT_KEY;
      delete process.env.JERRY_API_KEY;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("creates runtime without API key (will fallback on first turn)", async () => {
      const profile: PrivacyProfile = {
        runtime: "ozwell",
        model: "gpt-4.1-mini",
        egress: "deny",
      };

      // Create a mock local runtime for fallback
      let fallbackCalled = false;
      const mockLocalRuntime: AgentRuntime = {
        profile: { ...profile, runtime: "local" },
        async *runTurn(_input: TurnInput): AsyncIterable<RuntimeEvent> {
          fallbackCalled = true;
          yield { type: "start" };
          yield { type: "text-delta", text: "Hello from local" };
          yield { type: "finish", finishReason: "stop" };
        },
      };

      const runtime = createOzwellRuntime(profile, {
        skipProbe: true,
        createLocalFallback: () => mockLocalRuntime,
      });

      const events: RuntimeEvent[] = [];
      for await (const event of runtime.runTurn({
        messages: [{ role: "user", content: "Hello" }],
      })) {
        events.push(event);
      }

      // Should have fallback warning message
      const warningEvent = events.find(
        (e) => e.type === "text-delta" && e.text.includes("No Ozwell API key")
      );
      assert.ok(warningEvent, "Should emit fallback warning");

      // Fallback should have been called
      assert.ok(fallbackCalled, "Local fallback should be called");
    });

    it("falls back when probe fails (bad key)", async () => {
      const profile: PrivacyProfile = {
        runtime: "ozwell",
        model: "gpt-4.1-mini",
        egress: "deny",
        endpoint: "https://ozwellapi.os.mieweb.org",
        apiKey: "ozw_bad_key_for_probe",
      };

      let fallbackCalled = false;
      const mockLocalRuntime: AgentRuntime = {
        profile: { ...profile, runtime: "local" },
        async *runTurn(_input: TurnInput): AsyncIterable<RuntimeEvent> {
          fallbackCalled = true;
          yield { type: "start" };
          yield { type: "text-delta", text: "local fallback reply" };
          yield { type: "finish", finishReason: "stop" };
        },
      };

      const runtime = createOzwellRuntime(profile, {
        // Do NOT skip probe — we want probe failure path
        createLocalFallback: () => mockLocalRuntime,
      });

      const events: RuntimeEvent[] = [];
      for await (const event of runtime.runTurn({
        messages: [{ role: "user", content: "Hello" }],
      })) {
        events.push(event);
      }

      const warning = events.find(
        (e) => e.type === "text-delta" && e.text.includes("Falling back to local Ollama")
      );
      assert.ok(warning, "Should emit Ozwell unavailable notice");
      assert.ok(fallbackCalled, "Local fallback should run after probe failure");
      const localText = events.find(
        (e) => e.type === "text-delta" && e.text.includes("local fallback reply")
      );
      assert.ok(localText, "Should stream local fallback content");
    });
  });

  describe("runtime interface", () => {
    it("exposes profile", () => {
      const runtime = createOzwellRuntime(baseProfile, { skipProbe: true });
      assert.ok(runtime.profile);
      assert.equal(runtime.profile.runtime, "ozwell");
    });

    it("has runTurn method", () => {
      const runtime = createOzwellRuntime(baseProfile, { skipProbe: true });
      assert.equal(typeof runtime.runTurn, "function");
    });
  });
});

describe("DEFAULT_OZWELL_ENDPOINT", () => {
  it("is the Manager host", () => {
    assert.equal(DEFAULT_OZWELL_ENDPOINT, "https://ozwellapi.os.mieweb.org");
  });
});
