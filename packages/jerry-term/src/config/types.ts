/**
 * Configuration types for jerry-term.
 */

import type { RuntimeKind, PrivacyProfile } from "@mieweb/jerry-agent-runtime";

/** BYO provider identifiers */
export type ByoProviderId = "openai" | "moonshot" | "custom";

/** Credential entry for a single provider */
export interface ProviderCredential {
  apiKey: string;
  baseURL?: string;
  endpoint?: string;
}

/** Credentials vault storing keys for multiple providers */
export interface CredentialsVault {
  ozwell?: ProviderCredential;
  byo?: Partial<Record<ByoProviderId, ProviderCredential>>;
}

/** Last-used model per runtime/provider */
export interface LastModelMap {
  local?: string;
  ozwell?: string;
  byo?: Partial<Record<ByoProviderId, string>>;
}

export interface TermConfig {
  /** Runtime kind: local, ozwell, byo-cloud */
  runtime: RuntimeKind;
  /** BYO provider (only relevant when runtime is byo-cloud) */
  provider?: ByoProviderId;
  /** Model identifier (e.g., "ollama:llama3.1:8b") */
  model: string;
  /** API key for active runtime/provider (derived from credentials on load) */
  apiKey?: string;
  /** Custom endpoint URL */
  endpoint?: string;
  /** Egress policy */
  egress?: string;
  /** Credentials vault (persisted, never wiped on switch) */
  credentials?: CredentialsVault;
  /** Last-used model per runtime/provider */
  lastModel?: LastModelMap;
}

/** File shape for ~/.config/jerry-term/config.json */
export interface TermConfigFile {
  runtime?: string;
  provider?: string;
  model?: string;
  apiKey?: string;
  endpoint?: string;
  egress?: string;
  credentials?: CredentialsVault;
  lastModel?: LastModelMap;
}

export function termConfigToProfile(config: TermConfig): Partial<PrivacyProfile> {
  return {
    runtime: config.runtime,
    model: config.model,
    apiKey: config.apiKey,
    endpoint: config.endpoint,
    egress: config.egress as PrivacyProfile["egress"],
  };
}

/**
 * Get the active API key from credentials vault based on runtime/provider.
 */
export function getActiveApiKey(config: TermConfig): string | undefined {
  if (!config.credentials) return undefined;

  if (config.runtime === "ozwell") {
    return config.credentials.ozwell?.apiKey;
  }
  if (config.runtime === "byo-cloud" && config.provider) {
    return config.credentials.byo?.[config.provider]?.apiKey;
  }
  return undefined;
}

/**
 * Get the active endpoint from credentials vault based on runtime/provider.
 */
export function getActiveEndpoint(config: TermConfig): string | undefined {
  if (!config.credentials) return undefined;

  if (config.runtime === "ozwell") {
    return config.credentials.ozwell?.endpoint;
  }
  if (config.runtime === "byo-cloud" && config.provider) {
    return config.credentials.byo?.[config.provider]?.baseURL;
  }
  return undefined;
}

/**
 * Get the last-used model for the current runtime/provider.
 */
export function getLastModel(config: TermConfig): string | undefined {
  if (!config.lastModel) return undefined;

  if (config.runtime === "local") {
    return config.lastModel.local;
  }
  if (config.runtime === "ozwell") {
    return config.lastModel.ozwell;
  }
  if (config.runtime === "byo-cloud" && config.provider) {
    return config.lastModel.byo?.[config.provider];
  }
  return undefined;
}

/**
 * Set a credential in the vault (immutably returns new config).
 */
export function setCredential(
  config: TermConfig,
  runtime: RuntimeKind,
  provider: ByoProviderId | undefined,
  credential: ProviderCredential
): TermConfig {
  const credentials: CredentialsVault = { ...config.credentials };

  if (runtime === "ozwell") {
    credentials.ozwell = credential;
  } else if (runtime === "byo-cloud" && provider) {
    credentials.byo = { ...credentials.byo, [provider]: credential };
  }

  return { ...config, credentials };
}

/**
 * Set last-used model (immutably returns new config).
 */
export function setLastModel(
  config: TermConfig,
  runtime: RuntimeKind,
  provider: ByoProviderId | undefined,
  model: string
): TermConfig {
  const lastModel: LastModelMap = { ...config.lastModel };

  if (runtime === "local") {
    lastModel.local = model;
  } else if (runtime === "ozwell") {
    lastModel.ozwell = model;
  } else if (runtime === "byo-cloud" && provider) {
    lastModel.byo = { ...lastModel.byo, [provider]: model };
  }

  return { ...config, lastModel };
}
