import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { loadTermConfig } from "./loader.ts";

describe("Config Loader", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.JERRY_RUNTIME;
    delete process.env.JERRY_MODEL;
    delete process.env.JERRY_ENDPOINT;
    delete process.env.JERRY_EGRESS;
    delete process.env.JERRY_API_KEY;
    delete process.env.OZWELL_API_KEY;
    delete process.env.OZWELL_AGENT_KEY;
    delete process.env.OZWELL_ENDPOINT;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns default config when no env vars set", () => {
    const config = loadTermConfig();
    assert.equal(config.runtime, "local");
    assert.equal(config.model, "ollama:llama3.1:8b");
  });

  it("overrides runtime from JERRY_RUNTIME", () => {
    process.env.JERRY_RUNTIME = "ozwell";
    const config = loadTermConfig();
    assert.equal(config.runtime, "ozwell");
  });

  it("overrides model from JERRY_MODEL", () => {
    process.env.JERRY_MODEL = "custom:model";
    const config = loadTermConfig();
    assert.equal(config.model, "custom:model");
  });

  it("resolves OZWELL_API_KEY for ozwell runtime", () => {
    process.env.JERRY_RUNTIME = "ozwell";
    process.env.OZWELL_API_KEY = "ozw_test";
    const config = loadTermConfig();
    assert.equal(config.apiKey, "ozw_test");
  });

  it("resolves OPENAI_API_KEY for byo-cloud runtime", () => {
    process.env.JERRY_RUNTIME = "byo-cloud";
    process.env.OPENAI_API_KEY = "sk_test";
    const config = loadTermConfig();
    assert.equal(config.apiKey, "sk_test");
  });

  it("resolves endpoint from JERRY_ENDPOINT", () => {
    process.env.JERRY_ENDPOINT = "https://custom.api";
    const config = loadTermConfig();
    assert.equal(config.endpoint, "https://custom.api");
  });

  it("resolves endpoint from OZWELL_ENDPOINT as fallback", () => {
    process.env.OZWELL_ENDPOINT = "https://ozwell.api";
    const config = loadTermConfig();
    assert.equal(config.endpoint, "https://ozwell.api");
  });

  it("ignores invalid runtime values", () => {
    process.env.JERRY_RUNTIME = "invalid";
    const config = loadTermConfig();
    assert.equal(config.runtime, "local");
  });
});
