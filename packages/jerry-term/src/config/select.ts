/**
 * Runtime and model selection helpers for jerry-term.
 *
 * Centralized logic for switching runtime/provider/model while:
 * - Preserving credentials across switches
 * - Tracking lastModel per runtime/provider
 * - Applying to bridge and persisting config
 */

import type { RuntimeKind } from "@mieweb/jerry-agent-runtime";
import type { JerryBridge } from "../bridge/index.ts";
import type {
  TermConfig,
  ByoProviderId,
  ProviderCredential,
} from "./types.ts";
import {
  termConfigToProfile,
  setCredential,
  setLastModel,
  getLastModel,
  getActiveApiKey,
  getActiveEndpoint,
} from "./types.ts";
import { saveTermConfig } from "./loader.ts";
import {
  toWireModel,
  getProviderForRuntime,
  getDefaultModel,
} from "./providers.ts";

export interface SelectionResult {
  success: boolean;
  config: TermConfig;
  message: string;
  needsSetup?: boolean;
  setupDocsURL?: string;
}

/**
 * Check if a runtime/provider has credentials configured.
 */
export function hasCredentials(
  config: TermConfig,
  runtime: RuntimeKind,
  provider?: ByoProviderId
): boolean {
  if (runtime === "local") {
    return true;
  }
  if (runtime === "ozwell") {
    return !!(
      config.credentials?.ozwell?.apiKey ||
      process.env.OZWELL_API_KEY ||
      process.env.OZWELL_AGENT_KEY ||
      process.env.JERRY_API_KEY
    );
  }
  if (runtime === "byo-cloud" && provider) {
    return !!(
      config.credentials?.byo?.[provider]?.apiKey ||
      process.env.JERRY_API_KEY ||
      process.env.OPENAI_API_KEY
    );
  }
  return false;
}

/**
 * Select a runtime (and optionally provider for BYO).
 * Uses saved credentials and lastModel if available.
 * Returns config ready to apply or indicates setup needed.
 */
export function selectRuntime(
  config: TermConfig,
  runtime: RuntimeKind,
  provider?: ByoProviderId
): SelectionResult {
  const providerDef = getProviderForRuntime(runtime, provider);

  if (!hasCredentials(config, runtime, provider)) {
    return {
      success: false,
      config,
      message: `${providerDef?.name ?? runtime} requires API key setup`,
      needsSetup: true,
      setupDocsURL: providerDef?.docsURL,
    };
  }

  let newConfig: TermConfig = {
    ...config,
    runtime,
    provider: runtime === "byo-cloud" ? (provider ?? "openai") : undefined,
  };

  const lastModel = getLastModel(newConfig);
  if (lastModel) {
    newConfig.model = toWireModel(
      runtime,
      lastModel,
      providerDef?.baseURL ?? getActiveEndpoint(newConfig)
    );
  } else {
    const defaultModelId = getDefaultModel(providerDef?.id ?? runtime);
    if (defaultModelId) {
      newConfig.model = toWireModel(
        runtime,
        defaultModelId,
        providerDef?.baseURL ?? getActiveEndpoint(newConfig)
      );
    }
  }

  newConfig.apiKey = getActiveApiKey(newConfig);
  newConfig.endpoint = getActiveEndpoint(newConfig);

  return {
    success: true,
    config: newConfig,
    message: `Switched to ${providerDef?.name ?? runtime}`,
  };
}

/**
 * Select a model within the current runtime/provider.
 * Updates lastModel and returns config ready to apply.
 */
export function selectModel(
  config: TermConfig,
  modelId: string,
  baseURL?: string
): SelectionResult {
  const providerDef = getProviderForRuntime(config.runtime, config.provider);
  const url = baseURL ?? providerDef?.baseURL ?? getActiveEndpoint(config);

  const wireModel = toWireModel(config.runtime, modelId, url);

  let newConfig = setLastModel(
    config,
    config.runtime,
    config.provider,
    modelId
  );

  newConfig = {
    ...newConfig,
    model: wireModel,
  };

  if (baseURL && config.runtime === "byo-cloud" && config.provider === "custom") {
    newConfig = setCredential(newConfig, "byo-cloud", "custom", {
      apiKey: config.credentials?.byo?.custom?.apiKey ?? "",
      baseURL,
    });
  }

  return {
    success: true,
    config: newConfig,
    message: `Model set to ${modelId}`,
  };
}

/**
 * Set up credentials for a runtime/provider.
 * Returns config with new credentials (not yet applied).
 */
export function setupCredentials(
  config: TermConfig,
  runtime: RuntimeKind,
  provider: ByoProviderId | undefined,
  credential: ProviderCredential
): SelectionResult {
  const newConfig = setCredential(config, runtime, provider, credential);
  const providerDef = getProviderForRuntime(runtime, provider);

  return {
    success: true,
    config: newConfig,
    message: `${providerDef?.name ?? runtime} credentials saved`,
  };
}

/**
 * Apply selection to bridge and persist config.
 * Call this after selectRuntime/selectModel returns success.
 */
export function applySelection(
  bridge: JerryBridge,
  config: TermConfig,
  doSave: (config: TermConfig) => void = saveTermConfig
): { saved: boolean; error?: string } {
  bridge.switchRuntime(config.runtime, termConfigToProfile(config));

  try {
    doSave(config);
    return { saved: true };
  } catch (err) {
    return {
      saved: false,
      error: err instanceof Error ? err.message : "Save failed",
    };
  }
}

/**
 * Combined select and apply for simple switches.
 */
export function switchRuntime(
  bridge: JerryBridge,
  config: TermConfig,
  runtime: RuntimeKind,
  provider?: ByoProviderId,
  doSave: (config: TermConfig) => void = saveTermConfig
): SelectionResult & { saved: boolean } {
  const result = selectRuntime(config, runtime, provider);
  if (!result.success) {
    return { ...result, saved: false };
  }

  const { saved, error } = applySelection(bridge, result.config, doSave);
  if (error) {
    result.message += ` (${error})`;
  }

  return { ...result, saved };
}

/**
 * Combined select and apply for model changes.
 */
export function switchModel(
  bridge: JerryBridge,
  config: TermConfig,
  modelId: string,
  baseURL?: string,
  doSave: (config: TermConfig) => void = saveTermConfig
): SelectionResult & { saved: boolean } {
  const result = selectModel(config, modelId, baseURL);

  const { saved, error } = applySelection(bridge, result.config, doSave);
  if (error) {
    result.message += ` (${error})`;
  }

  return { ...result, saved };
}
