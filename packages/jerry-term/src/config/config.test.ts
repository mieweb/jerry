import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  loadTermConfig,
  getUserConfigPath,
  getRuntimeAvailability,
  getByoProviderAvailability,
} from "./loader.ts";
import type { TermConfig } from "./types.ts";
import {
  getActiveApiKey,
  getActiveEndpoint,
  getLastModel,
  setCredential,
  setLastModel,
  termConfigToProfile,
  clearCredential,
} from "./types.ts";
import {
  toWireModel,
  fromWireModel,
  getBaseURLFromWireModel,
  getProvider,
  getProviderForRuntime,
  getDefaultModel,
  partitionOzwellModels,
  OZWELL_RECOMMENDED_MODELS,
} from "./providers.ts";
import { hasCredentials, selectRuntime, selectModel } from "./select.ts";

// Note: saveTermConfig is tested indirectly through manual file operations
// to avoid writing to the user's actual config directory during tests.

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

  it("returns a valid runtime (local, ozwell, or byo-cloud)", () => {
    const config = loadTermConfig();
    assert.ok(["local", "ozwell", "byo-cloud"].includes(config.runtime));
    assert.ok(config.model.length > 0);
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

  it("ignores invalid runtime values from env", () => {
    process.env.JERRY_RUNTIME = "invalid";
    const config = loadTermConfig();
    assert.ok(["local", "ozwell", "byo-cloud"].includes(config.runtime));
    assert.notEqual(config.runtime, "invalid");
  });
});

describe("Config File Operations", () => {
  const testConfigDir = join(homedir(), ".config/jerry-term-test");

  beforeEach(() => {
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true });
    }
  });

  it("getUserConfigPath returns expected path", () => {
    const path = getUserConfigPath();
    assert.ok(path.includes(".config/jerry-term/config.json"));
  });

  it("config file format includes all fields when present", () => {
    mkdirSync(testConfigDir, { recursive: true });

    const config: TermConfig = {
      runtime: "ozwell",
      model: "gpt-4.1-mini",
      apiKey: "test-key",
      endpoint: "https://test.api",
      egress: "cloud",
    };

    const savedPath = join(testConfigDir, "config.json");
    writeFileSync(savedPath, JSON.stringify({
      runtime: config.runtime,
      model: config.model,
      apiKey: config.apiKey,
      endpoint: config.endpoint,
      egress: config.egress,
    }, null, 2) + "\n");

    const content = readFileSync(savedPath, "utf-8");
    const parsed = JSON.parse(content);

    assert.equal(parsed.runtime, "ozwell");
    assert.equal(parsed.model, "gpt-4.1-mini");
    assert.equal(parsed.apiKey, "test-key");
    assert.equal(parsed.endpoint, "https://test.api");
    assert.equal(parsed.egress, "cloud");
  });

  it("config file format includes only required fields when minimal", () => {
    mkdirSync(testConfigDir, { recursive: true });

    const config: TermConfig = {
      runtime: "local",
      model: "ollama:llama3.1:8b",
    };

    const savedPath = join(testConfigDir, "config-minimal.json");
    writeFileSync(savedPath, JSON.stringify({
      runtime: config.runtime,
      model: config.model,
    }, null, 2) + "\n");

    const content = readFileSync(savedPath, "utf-8");
    const parsed = JSON.parse(content);

    assert.equal(parsed.runtime, "local");
    assert.equal(parsed.model, "ollama:llama3.1:8b");
    assert.equal(parsed.apiKey, undefined);
    assert.equal(parsed.endpoint, undefined);
  });
});

describe("getRuntimeAvailability", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.JERRY_MODEL;
    delete process.env.JERRY_ENDPOINT;
    delete process.env.JERRY_API_KEY;
    delete process.env.OZWELL_API_KEY;
    delete process.env.OZWELL_AGENT_KEY;
    delete process.env.OZWELL_ENDPOINT;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns local as always available", () => {
    const emptyConfig: TermConfig = {
      runtime: "local",
      model: "ollama:llama3.1:8b",
    };
    const availability = getRuntimeAvailability(emptyConfig);
    const local = availability.find((r) => r.kind === "local");

    assert.ok(local);
    assert.equal(local.available, true);
    assert.ok(local.model?.includes("llama3.1:8b"));
  });

  it("returns ozwell as unavailable without API key (explicit empty config)", () => {
    const emptyConfig: TermConfig = {
      runtime: "local",
      model: "ollama:llama3.1:8b",
    };
    const availability = getRuntimeAvailability(emptyConfig);
    const ozwell = availability.find((r) => r.kind === "ozwell");

    assert.ok(ozwell);
    assert.equal(ozwell.available, false);
    assert.equal(ozwell.hasApiKey, false);
  });

  it("returns ozwell as available with OZWELL_API_KEY", () => {
    process.env.OZWELL_API_KEY = "ozw_test";
    const availability = getRuntimeAvailability();
    const ozwell = availability.find((r) => r.kind === "ozwell");

    assert.ok(ozwell);
    assert.equal(ozwell.available, true);
    assert.equal(ozwell.hasApiKey, true);
  });

  it("returns byo-cloud as available with OPENAI_API_KEY", () => {
    process.env.OPENAI_API_KEY = "sk_test";
    const availability = getRuntimeAvailability();
    const byo = availability.find((r) => r.kind === "byo-cloud");

    assert.ok(byo);
    assert.equal(byo.available, true);
    assert.equal(byo.hasApiKey, true);
  });

  it("includes endpoint info when configured", () => {
    process.env.OZWELL_API_KEY = "ozw_test";
    process.env.OZWELL_ENDPOINT = "https://custom.ozwell.api";
    const availability = getRuntimeAvailability();
    const ozwell = availability.find((r) => r.kind === "ozwell");

    assert.ok(ozwell);
    assert.equal(ozwell.endpoint, "https://custom.ozwell.api");
  });

  it("returns ozwell as available with credentials vault", () => {
    const config: TermConfig = {
      runtime: "local",
      model: "ollama:llama3.1:8b",
      credentials: {
        ozwell: { apiKey: "ozw_vault_key" },
      },
    };
    const availability = getRuntimeAvailability(config);
    const ozwell = availability.find((r) => r.kind === "ozwell");

    assert.ok(ozwell);
    assert.equal(ozwell.available, true);
    assert.equal(ozwell.hasApiKey, true);
  });

  it("returns byo-cloud as available with any BYO provider key in vault", () => {
    const config: TermConfig = {
      runtime: "local",
      model: "ollama:llama3.1:8b",
      credentials: {
        byo: {
          openai: { apiKey: "sk_vault_key" },
        },
      },
    };
    const availability = getRuntimeAvailability(config);
    const byo = availability.find((r) => r.kind === "byo-cloud");

    assert.ok(byo);
    assert.equal(byo.available, true);
    assert.equal(byo.hasApiKey, true);
  });
});

describe("Credentials Vault Functions", () => {
  it("getActiveApiKey returns ozwell key for ozwell runtime", () => {
    const config: TermConfig = {
      runtime: "ozwell",
      model: "gpt-4.1-mini",
      credentials: {
        ozwell: { apiKey: "ozw_test" },
      },
    };
    assert.equal(getActiveApiKey(config), "ozw_test");
  });

  it("getActiveApiKey returns byo provider key for byo-cloud runtime", () => {
    const config: TermConfig = {
      runtime: "byo-cloud",
      provider: "openai",
      model: "https://api.openai.com/v1#gpt-4o",
      credentials: {
        byo: {
          openai: { apiKey: "sk_test" },
        },
      },
    };
    assert.equal(getActiveApiKey(config), "sk_test");
  });

  it("getActiveEndpoint returns ozwell endpoint", () => {
    const config: TermConfig = {
      runtime: "ozwell",
      model: "gpt-4.1-mini",
      credentials: {
        ozwell: { apiKey: "ozw_test", endpoint: "https://custom.ozwell.api" },
      },
    };
    assert.equal(getActiveEndpoint(config), "https://custom.ozwell.api");
  });

  it("getActiveEndpoint returns byo baseURL", () => {
    const config: TermConfig = {
      runtime: "byo-cloud",
      provider: "custom",
      model: "https://custom.api/v1#model",
      credentials: {
        byo: {
          custom: { apiKey: "key", baseURL: "https://custom.api/v1" },
        },
      },
    };
    assert.equal(getActiveEndpoint(config), "https://custom.api/v1");
  });

  it("getLastModel returns last model for runtime", () => {
    const config: TermConfig = {
      runtime: "ozwell",
      model: "gpt-4.1-mini",
      lastModel: {
        ozwell: "gpt-4o",
        local: "llama3.1:8b",
      },
    };
    assert.equal(getLastModel(config), "gpt-4o");
  });

  it("getLastModel returns byo provider last model", () => {
    const config: TermConfig = {
      runtime: "byo-cloud",
      provider: "openai",
      model: "https://api.openai.com/v1#gpt-4o",
      lastModel: {
        byo: {
          openai: "gpt-4-turbo",
        },
      },
    };
    assert.equal(getLastModel(config), "gpt-4-turbo");
  });

  it("setCredential adds ozwell credentials", () => {
    const config: TermConfig = {
      runtime: "local",
      model: "ollama:llama3.1:8b",
    };
    const updated = setCredential(config, "ozwell", undefined, {
      apiKey: "ozw_new",
      endpoint: "https://new.api",
    });
    assert.equal(updated.credentials?.ozwell?.apiKey, "ozw_new");
    assert.equal(updated.credentials?.ozwell?.endpoint, "https://new.api");
  });

  it("setCredential adds byo provider credentials", () => {
    const config: TermConfig = {
      runtime: "local",
      model: "ollama:llama3.1:8b",
    };
    const updated = setCredential(config, "byo-cloud", "moonshot", {
      apiKey: "ms_key",
      baseURL: "https://api.moonshot.cn/v1",
    });
    assert.equal(updated.credentials?.byo?.moonshot?.apiKey, "ms_key");
    assert.equal(updated.credentials?.byo?.moonshot?.baseURL, "https://api.moonshot.cn/v1");
  });

  it("setLastModel updates last model for runtime", () => {
    const config: TermConfig = {
      runtime: "ozwell",
      model: "gpt-4.1-mini",
    };
    const updated = setLastModel(config, "ozwell", undefined, "gpt-4o");
    assert.equal(updated.lastModel?.ozwell, "gpt-4o");
  });

  it("setLastModel updates byo provider last model", () => {
    const config: TermConfig = {
      runtime: "byo-cloud",
      provider: "openai",
      model: "https://api.openai.com/v1#gpt-4o",
    };
    const updated = setLastModel(config, "byo-cloud", "openai", "gpt-4-turbo");
    assert.equal(updated.lastModel?.byo?.openai, "gpt-4-turbo");
  });
});

describe("Provider Registry", () => {
  it("toWireModel formats local model", () => {
    assert.equal(toWireModel("local", "llama3.1:8b"), "ollama:llama3.1:8b");
    assert.equal(toWireModel("local", "ollama:llama3.1:8b"), "ollama:llama3.1:8b");
  });

  it("toWireModel formats ozwell model", () => {
    assert.equal(toWireModel("ozwell", "gpt-4.1-mini"), "gpt-4.1-mini");
    assert.equal(toWireModel("ozwell", "ollama:model"), "model");
  });

  it("toWireModel formats byo-cloud model with baseURL", () => {
    assert.equal(
      toWireModel("byo-cloud", "gpt-4o", "https://api.openai.com/v1"),
      "https://api.openai.com/v1#gpt-4o"
    );
  });

  it("toWireModel preserves existing URL format", () => {
    const url = "https://api.openai.com/v1#gpt-4o";
    assert.equal(toWireModel("byo-cloud", url), url);
  });

  it("fromWireModel extracts local model id", () => {
    assert.equal(fromWireModel("ollama:llama3.1:8b"), "llama3.1:8b");
  });

  it("fromWireModel extracts byo model id from URL", () => {
    assert.equal(fromWireModel("https://api.openai.com/v1#gpt-4o"), "gpt-4o");
  });

  it("fromWireModel returns bare model as-is", () => {
    assert.equal(fromWireModel("gpt-4.1-mini"), "gpt-4.1-mini");
  });

  it("getBaseURLFromWireModel extracts baseURL", () => {
    assert.equal(
      getBaseURLFromWireModel("https://api.openai.com/v1#gpt-4o"),
      "https://api.openai.com/v1"
    );
  });

  it("getBaseURLFromWireModel returns undefined for non-URL", () => {
    assert.equal(getBaseURLFromWireModel("gpt-4.1-mini"), undefined);
  });

  it("getProvider returns provider definition by id", () => {
    const openai = getProvider("openai");
    assert.ok(openai);
    assert.equal(openai.runtime, "byo-cloud");
    assert.equal(openai.byoProvider, "openai");
  });

  it("getProviderForRuntime returns correct provider", () => {
    const ollama = getProviderForRuntime("local", undefined);
    assert.equal(ollama?.id, "ollama");

    const ozwell = getProviderForRuntime("ozwell", undefined);
    assert.equal(ozwell?.id, "ozwell");

    const openai = getProviderForRuntime("byo-cloud", "openai");
    assert.equal(openai?.id, "openai");
  });

  it("getDefaultModel returns default for provider", () => {
    assert.equal(getDefaultModel("ollama"), "llama3.1:8b");
    assert.equal(getDefaultModel("ozwell"), "gpt-4.1-mini");
    assert.equal(getDefaultModel("openai"), "gpt-4o");
  });

  it("partitionOzwellModels puts recommended first and sorts other", () => {
    const { recommended, other } = partitionOzwellModels(
      ["whisper-1", "gpt-4o", "custom-a", "gpt-4.1-mini"],
      "gpt-4o"
    );
    assert.deepEqual(
      recommended.map((m) => m.id),
      ["gpt-4o", "gpt-4.1-mini"]
    );
    assert.deepEqual(other, ["custom-a", "whisper-1"]);
  });

  it("partitionOzwellModels pins non-curated current model", () => {
    const { recommended, other } = partitionOzwellModels(
      ["gpt-4.1-mini", "my-custom"],
      "my-custom"
    );
    assert.equal(recommended[0]?.id, "my-custom");
    assert.ok(recommended.some((m) => m.id === "gpt-4.1-mini"));
    assert.deepEqual(other, []);
  });

  it("ozwell recommended catalog stays non-empty", () => {
    assert.ok(OZWELL_RECOMMENDED_MODELS.length >= 4);
    assert.equal(OZWELL_RECOMMENDED_MODELS[0]?.id, "gpt-4.1-mini");
  });
});

describe("Selection Helpers", () => {
  it("hasCredentials returns true for local", () => {
    const config: TermConfig = { runtime: "local", model: "ollama:llama3.1:8b" };
    assert.equal(hasCredentials(config, "local", undefined), true);
  });

  it("hasCredentials returns false for ozwell without key", () => {
    const config: TermConfig = { runtime: "local", model: "ollama:llama3.1:8b" };
    assert.equal(hasCredentials(config, "ozwell", undefined), false);
  });

  it("hasCredentials returns true for ozwell with vault key", () => {
    const config: TermConfig = {
      runtime: "local",
      model: "ollama:llama3.1:8b",
      credentials: { ozwell: { apiKey: "ozw_test" } },
    };
    assert.equal(hasCredentials(config, "ozwell", undefined), true);
  });

  it("selectRuntime returns needsSetup for unconfigured runtime", () => {
    const config: TermConfig = { runtime: "local", model: "ollama:llama3.1:8b" };
    const result = selectRuntime(config, "ozwell", undefined);
    assert.equal(result.success, false);
    assert.equal(result.needsSetup, true);
  });

  it("selectRuntime switches to configured runtime", () => {
    const config: TermConfig = {
      runtime: "local",
      model: "ollama:llama3.1:8b",
      credentials: { ozwell: { apiKey: "ozw_test" } },
    };
    const result = selectRuntime(config, "ozwell", undefined);
    assert.equal(result.success, true);
    assert.equal(result.config.runtime, "ozwell");
  });

  it("selectRuntime uses lastModel if available", () => {
    const config: TermConfig = {
      runtime: "local",
      model: "ollama:llama3.1:8b",
      credentials: { ozwell: { apiKey: "ozw_test" } },
      lastModel: { ozwell: "gpt-4o" },
    };
    const result = selectRuntime(config, "ozwell", undefined);
    assert.equal(result.success, true);
    assert.equal(result.config.model, "gpt-4o");
  });

  it("selectModel updates model and lastModel", () => {
    const config: TermConfig = {
      runtime: "ozwell",
      model: "gpt-4.1-mini",
    };
    const result = selectModel(config, "gpt-4o");
    assert.equal(result.success, true);
    assert.equal(result.config.model, "gpt-4o");
    assert.equal(result.config.lastModel?.ozwell, "gpt-4o");
  });

  it("selectModel formats byo model with baseURL", () => {
    const config: TermConfig = {
      runtime: "byo-cloud",
      provider: "openai",
      model: "https://api.openai.com/v1#gpt-4o",
    };
    const result = selectModel(config, "gpt-4-turbo");
    assert.equal(result.success, true);
    assert.equal(result.config.model, "https://api.openai.com/v1#gpt-4-turbo");
    assert.equal(result.config.lastModel?.byo?.openai, "gpt-4-turbo");
  });
});

describe("BYO Provider Availability", () => {
  it("returns availability for OpenAI and Anthropic providers", () => {
    const config: TermConfig = {
      runtime: "local",
      model: "ollama:llama3.1:8b",
      credentials: {
        byo: {
          openai: { apiKey: "sk_test" },
        },
      },
      lastModel: {
        byo: {
          openai: "gpt-4o",
        },
      },
    };
    const availability = getByoProviderAvailability(config);

    assert.equal(availability.length, 2);

    const openai = availability.find((p) => p.id === "openai");
    assert.ok(openai);
    assert.equal(openai.hasApiKey, true);
    assert.equal(openai.lastModel, "gpt-4o");

    const anthropic = availability.find((p) => p.id === "anthropic");
    assert.ok(anthropic);
    assert.equal(anthropic.hasApiKey, false);
  });
});

describe("Config Persistence", () => {
  const testConfigDir = join(homedir(), ".config/jerry-term-test-persist");

  beforeEach(() => {
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testConfigDir)) {
      rmSync(testConfigDir, { recursive: true });
    }
  });

  it("clearCredential persists deletion when saved", () => {
    mkdirSync(testConfigDir, { recursive: true });
    const testPath = join(testConfigDir, "config.json");

    // Start with a config that has credentials
    const initial: TermConfig = {
      runtime: "byo-cloud",
      provider: "openai",
      model: "https://api.openai.com/v1#gpt-4o",
      credentials: {
        byo: {
          openai: { apiKey: "sk_test123" },
          anthropic: { apiKey: "sk-ant-test456" },
        },
      },
    };

    // Save initial config
    writeFileSync(testPath, JSON.stringify({
      runtime: initial.runtime,
      provider: initial.provider,
      model: initial.model,
      credentials: initial.credentials,
    }, null, 2) + "\n");

    // Load it back
    const loaded = JSON.parse(readFileSync(testPath, "utf-8"));
    assert.equal(loaded.credentials?.byo?.openai?.apiKey, "sk_test123");
    assert.equal(loaded.credentials?.byo?.anthropic?.apiKey, "sk-ant-test456");

    // Clear OpenAI credential
    const cleared = clearCredential(initial, "byo-cloud", "openai");

    // Save cleared config
    writeFileSync(testPath, JSON.stringify({
      runtime: cleared.runtime,
      provider: cleared.provider,
      model: cleared.model,
      credentials: cleared.credentials,
    }, null, 2) + "\n");

    // Load again and verify OpenAI is gone but Anthropic remains
    const reloaded = JSON.parse(readFileSync(testPath, "utf-8"));
    assert.equal(reloaded.credentials?.byo?.openai, undefined);
    assert.equal(reloaded.credentials?.byo?.anthropic?.apiKey, "sk-ant-test456");
  });
});

describe("termConfigToProfile", () => {
  it("falls back to vault-resolved apiKey when flat field is unset", () => {
    const config: TermConfig = {
      runtime: "byo-cloud",
      provider: "openai",
      model: "https://api.openai.com/v1#gpt-4o",
      credentials: {
        byo: {
          openai: { apiKey: "sk_vault_key" },
        },
      },
    };
    const profile = termConfigToProfile(config);
    assert.equal(profile.apiKey, "sk_vault_key");
  });

  it("falls back to vault-resolved endpoint when flat field is unset", () => {
    const config: TermConfig = {
      runtime: "byo-cloud",
      provider: "custom",
      model: "https://custom.api/v1#model",
      credentials: {
        byo: {
          custom: { apiKey: "key", baseURL: "https://custom.api/v1" },
        },
      },
    };
    const profile = termConfigToProfile(config);
    assert.equal(profile.endpoint, "https://custom.api/v1");
  });

  it("explicit config.apiKey wins over vault", () => {
    const config: TermConfig = {
      runtime: "byo-cloud",
      provider: "openai",
      model: "https://api.openai.com/v1#gpt-4o",
      apiKey: "sk_explicit_key",
      credentials: {
        byo: {
          openai: { apiKey: "sk_vault_key" },
        },
      },
    };
    const profile = termConfigToProfile(config);
    assert.equal(profile.apiKey, "sk_explicit_key");
  });

  it("explicit config.endpoint wins over vault", () => {
    const config: TermConfig = {
      runtime: "byo-cloud",
      provider: "custom",
      model: "https://custom.api/v1#model",
      endpoint: "https://explicit.api/v1",
      credentials: {
        byo: {
          custom: { apiKey: "key", baseURL: "https://vault.api/v1" },
        },
      },
    };
    const profile = termConfigToProfile(config);
    assert.equal(profile.endpoint, "https://explicit.api/v1");
  });

  it("resolves anthropic runtime apiKey from vault", () => {
    const config: TermConfig = {
      runtime: "anthropic",
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      credentials: {
        byo: {
          anthropic: { apiKey: "sk-ant-vault-key" },
        },
      },
    };
    const profile = termConfigToProfile(config);
    assert.equal(profile.apiKey, "sk-ant-vault-key");
  });

  it("resolves ozwell runtime apiKey from vault", () => {
    const config: TermConfig = {
      runtime: "ozwell",
      model: "gpt-4.1-mini",
      credentials: {
        ozwell: { apiKey: "ozw_vault_key" },
      },
    };
    const profile = termConfigToProfile(config);
    assert.equal(profile.apiKey, "ozw_vault_key");
  });
});
