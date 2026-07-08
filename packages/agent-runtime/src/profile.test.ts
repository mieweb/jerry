import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PRIVACY_PROFILE,
  parseModelRef,
  mergeProfile,
} from "./profile.ts";

describe("DEFAULT_PRIVACY_PROFILE", () => {
  it("has local runtime", () => {
    assert.equal(DEFAULT_PRIVACY_PROFILE.runtime, "local");
  });

  it("uses ollama:qwen2.5 model", () => {
    assert.equal(DEFAULT_PRIVACY_PROFILE.model, "ollama:qwen2.5");
  });

  it("denies egress by default", () => {
    assert.equal(DEFAULT_PRIVACY_PROFILE.egress, "deny");
  });

  it("has default tool dispositions", () => {
    assert.deepEqual(DEFAULT_PRIVACY_PROFILE.tools, {
      summarize_activity: "local",
      search_memory: "local",
      schedule_followup: "local",
      read_file: "local",
      list_watched: "local",
      index_document: "local",
      drive: "ask",
      youtube: "ask",
    });
  });
});

describe("parseModelRef", () => {
  describe("ollama format", () => {
    it("parses ollama:qwen2.5", () => {
      const result = parseModelRef("ollama:qwen2.5");
      assert.deepEqual(result, {
        provider: "ollama",
        baseURL: "http://127.0.0.1:11434/v1",
        modelId: "qwen2.5",
      });
    });

    it("parses ollama:llama3.2", () => {
      const result = parseModelRef("ollama:llama3.2");
      assert.deepEqual(result, {
        provider: "ollama",
        baseURL: "http://127.0.0.1:11434/v1",
        modelId: "llama3.2",
      });
    });

    it("throws on empty model name", () => {
      assert.throws(
        () => parseModelRef("ollama:"),
        /missing model name/
      );
    });
  });

  describe("URL format (byo-cloud)", () => {
    it("parses https URL with model hash", () => {
      const result = parseModelRef("https://api.openai.com/v1#gpt-4o");
      assert.deepEqual(result, {
        provider: "openai-compatible",
        baseURL: "https://api.openai.com/v1",
        modelId: "gpt-4o",
      });
    });

    it("parses custom endpoint", () => {
      const result = parseModelRef("https://my-llm.example.com/api#custom-model");
      assert.deepEqual(result, {
        provider: "openai-compatible",
        baseURL: "https://my-llm.example.com/api",
        modelId: "custom-model",
      });
    });

    it("throws on missing # separator", () => {
      assert.throws(
        () => parseModelRef("https://api.openai.com/v1"),
        /missing #<model> suffix/
      );
    });

    it("throws on empty model name after #", () => {
      assert.throws(
        () => parseModelRef("https://api.openai.com/v1#"),
        /missing model name after #/
      );
    });
  });

  describe("invalid formats", () => {
    it("throws on unsupported format", () => {
      assert.throws(
        () => parseModelRef("gpt-4o"),
        /Unsupported model reference format/
      );
    });

    it("throws on empty string", () => {
      assert.throws(
        () => parseModelRef(""),
        /Unsupported model reference format/
      );
    });
  });
});

describe("mergeProfile", () => {
  it("returns default profile when called with no args", () => {
    const result = mergeProfile();
    assert.deepEqual(result, DEFAULT_PRIVACY_PROFILE);
  });

  it("returns default profile when called with undefined", () => {
    const result = mergeProfile(undefined);
    assert.deepEqual(result, DEFAULT_PRIVACY_PROFILE);
  });

  it("overrides runtime", () => {
    const result = mergeProfile({ runtime: "byo-cloud" });
    assert.equal(result.runtime, "byo-cloud");
    assert.equal(result.model, DEFAULT_PRIVACY_PROFILE.model);
  });

  it("overrides model", () => {
    const result = mergeProfile({ model: "ollama:llama3.2" });
    assert.equal(result.model, "ollama:llama3.2");
  });

  it("overrides egress", () => {
    const result = mergeProfile({ egress: "allow-model" });
    assert.equal(result.egress, "allow-model");
  });

  it("replaces tools entirely when provided", () => {
    const result = mergeProfile({ tools: { custom: "local" } });
    assert.deepEqual(result.tools, { custom: "local" });
  });

  it("preserves default tools when not provided", () => {
    const result = mergeProfile({ runtime: "local" });
    assert.deepEqual(result.tools, DEFAULT_PRIVACY_PROFILE.tools);
  });

  it("does not mutate default profile", () => {
    const original = { ...DEFAULT_PRIVACY_PROFILE };
    mergeProfile({ runtime: "byo-cloud" });
    assert.deepEqual(DEFAULT_PRIVACY_PROFILE, original);
  });
});
