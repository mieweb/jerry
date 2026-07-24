/**
 * Configuration loader for jerry-term.
 *
 * Reads configuration from environment and config files.
 * Priority: env vars > credentials vault > defaults
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import type { RuntimeKind } from "@mieweb/jerry-agent-runtime";
import type {
  TermConfig,
  TermConfigFile,
  ByoProviderId,
  CredentialsVault,
} from "./types.ts";
import { getActiveApiKey, getActiveEndpoint } from "./types.ts";

const DEFAULT_CONFIG: TermConfig = {
  runtime: "local",
  model: "ollama:llama3.1:8b",
};

const VALID_BYO_PROVIDERS: ByoProviderId[] = ["openai", "anthropic", "moonshot", "custom"];

/**
 * Get config file paths to check (lowest to highest precedence).
 * If JERRY_TERM_CONFIG env var is set, use only that path.
 * This enables tests to be hermetic and supports --config CLI flag.
 */
function getConfigPaths(): string[] {
  const overridePath = process.env.JERRY_TERM_CONFIG;
  if (overridePath) {
    return [overridePath];
  }
  const home = homedir();
  return [
    join(process.cwd(), ".jerry-term.json"),
    join(home, ".config/jerry-term/config.json"),
    join(home, ".jerry-term.json"),
  ];
}

function readConfigFile(path: string): TermConfigFile | null {
  try {
    if (!existsSync(path)) return null;
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content) as TermConfigFile;
  } catch {
    return null;
  }
}

function isValidRuntime(value: string): value is RuntimeKind {
  return ["local", "ozwell", "byo-cloud", "anthropic"].includes(value);
}

function isValidByoProvider(value: string): value is ByoProviderId {
  return VALID_BYO_PROVIDERS.includes(value as ByoProviderId);
}

/**
 * Migrate flat apiKey from old config format into credentials vault.
 * Called when loading a config that has apiKey but no credentials.
 */
function migrateToCredentialsVault(
  fileConfig: TermConfigFile,
  runtime: RuntimeKind,
  provider?: ByoProviderId
): CredentialsVault {
  const credentials: CredentialsVault = fileConfig.credentials ?? {};

  if (fileConfig.apiKey) {
    if (runtime === "ozwell") {
      credentials.ozwell = {
        apiKey: fileConfig.apiKey,
        endpoint: fileConfig.endpoint,
      };
    } else if (runtime === "byo-cloud") {
      const byoProvider = provider ?? "openai";
      credentials.byo = credentials.byo ?? {};
      credentials.byo[byoProvider] = {
        apiKey: fileConfig.apiKey,
        baseURL: fileConfig.endpoint,
      };
    }
  }

  return credentials;
}

export function loadTermConfig(): TermConfig {
  const config: TermConfig = { ...DEFAULT_CONFIG };
  let needsMigration = false;

  // Try config files (lowest precedence first, so later ones override)
  const paths = getConfigPaths().reverse();
  for (const path of paths) {
    const fileConfig = readConfigFile(path);
    if (fileConfig) {
      if (fileConfig.runtime && isValidRuntime(fileConfig.runtime)) {
        config.runtime = fileConfig.runtime;
      }
      if (fileConfig.provider && isValidByoProvider(fileConfig.provider)) {
        config.provider = fileConfig.provider;
      }
      if (fileConfig.model) {
        config.model = fileConfig.model;
      }
      if (fileConfig.egress) {
        config.egress = fileConfig.egress;
      }

      // Load credentials vault
      if (fileConfig.credentials) {
        config.credentials = {
          ...config.credentials,
          ...fileConfig.credentials,
        };
        if (fileConfig.credentials.byo) {
          config.credentials.byo = {
            ...config.credentials?.byo,
            ...fileConfig.credentials.byo,
          };
        }
      }

      // Load lastModel map
      if (fileConfig.lastModel) {
        config.lastModel = {
          ...config.lastModel,
          ...fileConfig.lastModel,
        };
        if (fileConfig.lastModel.byo) {
          config.lastModel.byo = {
            ...config.lastModel?.byo,
            ...fileConfig.lastModel.byo,
          };
        }
      }

      // Check if migration needed (has flat apiKey but no credentials)
      if (fileConfig.apiKey && !fileConfig.credentials) {
        needsMigration = true;
        config.credentials = migrateToCredentialsVault(
          fileConfig,
          config.runtime,
          config.provider
        );
      }

      // Legacy flat endpoint (migrate to credentials if needed)
      if (fileConfig.endpoint && !fileConfig.credentials) {
        config.endpoint = fileConfig.endpoint;
      }
    }
  }

  // Default provider for byo-cloud if not set
  if (config.runtime === "byo-cloud" && !config.provider) {
    config.provider = "openai";
  }

  // Default provider for anthropic if not set
  if (config.runtime === "anthropic" && !config.provider) {
    config.provider = "anthropic";
  }

  // Environment variables (highest precedence)
  if (process.env.JERRY_RUNTIME && isValidRuntime(process.env.JERRY_RUNTIME)) {
    config.runtime = process.env.JERRY_RUNTIME;
  }

  if (process.env.JERRY_MODEL) {
    config.model = process.env.JERRY_MODEL;
  }

  if (process.env.JERRY_EGRESS) {
    config.egress = process.env.JERRY_EGRESS;
  }

  // Resolve endpoint from vault then env
  const vaultEndpoint = getActiveEndpoint(config);
  config.endpoint =
    process.env.JERRY_ENDPOINT ??
    process.env.OZWELL_ENDPOINT ??
    vaultEndpoint ??
    config.endpoint;

  // Resolve API key: env vars > credentials vault
  const vaultApiKey = getActiveApiKey(config);
  if (config.runtime === "ozwell") {
    config.apiKey =
      process.env.OZWELL_API_KEY ??
      process.env.OZWELL_AGENT_KEY ??
      process.env.JERRY_API_KEY ??
      vaultApiKey;
  } else if (config.runtime === "anthropic") {
    config.apiKey =
      process.env.ANTHROPIC_API_KEY ??
      vaultApiKey;
  } else if (config.runtime === "byo-cloud") {
    config.apiKey =
      process.env.JERRY_API_KEY ??
      process.env.OPENAI_API_KEY ??
      vaultApiKey;
  } else {
    config.apiKey = process.env.JERRY_API_KEY ?? vaultApiKey;
  }

  // Save migrated config if needed
  if (needsMigration) {
    try {
      saveTermConfig(config);
    } catch {
      // Ignore save errors during migration
    }
  }

  return config;
}

/**
 * Get the user config file path (~/.config/jerry-term/config.json).
 */
export function getUserConfigPath(): string {
  return join(homedir(), ".config/jerry-term/config.json");
}

/**
 * Save TermConfig to the user config file.
 * Creates ~/.config/jerry-term/ directory if it doesn't exist.
 * Writes credentials exactly as they are in memory (allows deletions to persist).
 */
export function saveTermConfig(config: TermConfig): void {
  const configPath = getUserConfigPath();
  const configDir = dirname(configPath);

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const fileConfig: TermConfigFile = {
    runtime: config.runtime,
    model: config.model,
  };

  if (config.provider) {
    fileConfig.provider = config.provider;
  }

  if (config.egress) {
    fileConfig.egress = config.egress;
  }

  // Write credentials exactly as they are in memory (don't merge from file)
  // This allows deletions via clearCredential to persist
  if (config.credentials) {
    fileConfig.credentials = config.credentials;
  }

  // Write lastModel exactly as it is in memory
  if (config.lastModel) {
    fileConfig.lastModel = config.lastModel;
  }

  // Don't write flat apiKey anymore - it lives in credentials vault
  // Don't write flat endpoint - it lives in credentials vault

  writeFileSync(configPath, JSON.stringify(fileConfig, null, 2) + "\n", "utf-8");
}

/**
 * Runtime availability info for display.
 */
export interface RuntimeAvailability {
  kind: RuntimeKind;
  available: boolean;
  model?: string;
  hasApiKey: boolean;
  endpoint?: string;
}

/**
 * BYO provider availability info.
 */
export interface ByoProviderAvailability {
  id: ByoProviderId;
  hasApiKey: boolean;
  baseURL?: string;
  lastModel?: string;
}

/**
 * Check which runtimes are configured and available.
 * Now checks both env vars AND file credentials vault.
 */
export function getRuntimeAvailability(config?: TermConfig): RuntimeAvailability[] {
  // Load config if not provided (for availability check)
  const cfg = config ?? loadTermConfigForAvailability();

  // Check env vars
  const ozwellEnvKey =
    process.env.OZWELL_API_KEY ??
    process.env.OZWELL_AGENT_KEY ??
    process.env.JERRY_API_KEY;

  const byoEnvKey =
    process.env.JERRY_API_KEY ??
    process.env.OPENAI_API_KEY;

  // Check credentials vault
  const ozwellVaultKey = cfg.credentials?.ozwell?.apiKey;
  const hasAnyByoKey = cfg.credentials?.byo
    ? Object.values(cfg.credentials.byo).some((p) => p?.apiKey)
    : false;

  const ozwellEndpoint =
    process.env.JERRY_ENDPOINT ??
    process.env.OZWELL_ENDPOINT ??
    cfg.credentials?.ozwell?.endpoint;

  return [
    {
      kind: "local" as RuntimeKind,
      available: true,
      model: process.env.JERRY_MODEL ?? cfg.lastModel?.local ?? "ollama:llama3.1:8b",
      hasApiKey: false,
    },
    {
      kind: "ozwell" as RuntimeKind,
      available: !!(ozwellEnvKey || ozwellVaultKey),
      hasApiKey: !!(ozwellEnvKey || ozwellVaultKey),
      endpoint: ozwellEndpoint,
    },
    {
      kind: "byo-cloud" as RuntimeKind,
      available: !!(byoEnvKey || hasAnyByoKey),
      hasApiKey: !!(byoEnvKey || hasAnyByoKey),
    },
  ];
}

/** BYO providers shown in the picker (OpenAI + Anthropic only). */
const VISIBLE_BYO_PROVIDERS: ByoProviderId[] = ["openai", "anthropic"];

/**
 * Get availability for BYO providers specifically.
 */
export function getByoProviderAvailability(config?: TermConfig): ByoProviderAvailability[] {
  const cfg = config ?? loadTermConfigForAvailability();
  const byoCreds = cfg.credentials?.byo ?? {};
  const byoLastModels = cfg.lastModel?.byo ?? {};

  return VISIBLE_BYO_PROVIDERS.map((id) => ({
    id,
    hasApiKey: !!byoCreds[id]?.apiKey,
    baseURL: byoCreds[id]?.baseURL,
    lastModel: byoLastModels[id],
  }));
}

/**
 * Minimal config load for availability checks (no env resolution for apiKey).
 */
function loadTermConfigForAvailability(): TermConfig {
  const config: TermConfig = { ...DEFAULT_CONFIG };

  const paths = getConfigPaths().reverse();
  for (const path of paths) {
    const fileConfig = readConfigFile(path);
    if (fileConfig) {
      if (fileConfig.credentials) {
        config.credentials = {
          ...config.credentials,
          ...fileConfig.credentials,
        };
        if (fileConfig.credentials.byo) {
          config.credentials.byo = {
            ...config.credentials?.byo,
            ...fileConfig.credentials.byo,
          };
        }
      }
      if (fileConfig.lastModel) {
        config.lastModel = {
          ...config.lastModel,
          ...fileConfig.lastModel,
        };
        if (fileConfig.lastModel.byo) {
          config.lastModel.byo = {
            ...config.lastModel?.byo,
            ...fileConfig.lastModel.byo,
          };
        }
      }
    }
  }

  return config;
}
