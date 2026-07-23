/**
 * Provider registry for jerry-term.
 *
 * Static definitions for supported LLM providers with model catalogs,
 * setup docs, and wire format helpers.
 */

import type { RuntimeKind } from "@mieweb/jerry-agent-runtime";
import type { ByoProviderId } from "./types.ts";

export interface ProviderModel {
  id: string;
  name: string;
  description?: string;
}

export interface ProviderDefinition {
  id: string;
  name: string;
  runtime: RuntimeKind;
  byoProvider?: ByoProviderId;
  baseURL?: string;
  docsURL?: string;
  keyPrefix?: string;
  models: ProviderModel[];
  supportsModelList?: boolean;
}

/**
 * Recommended Ozwell chat models (shown first in pickers).
 * IDs should match live Manager `/v1/models` when possible.
 */
export const OZWELL_RECOMMENDED_MODELS: ProviderModel[] = [
  { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", description: "Recommended default" },
  { id: "gpt-4.1", name: "GPT-4.1", description: "Balanced GPT-4.1" },
  { id: "gpt-4o", name: "GPT-4o", description: "Multimodal flagship" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", description: "Efficient multimodal" },
  { id: "gpt-5-mini", name: "GPT-5 Mini", description: "Fast GPT-5" },
  { id: "gpt-5", name: "GPT-5", description: "Latest GPT-5" },
  { id: "claude-sonnet-5", name: "Claude Sonnet 5", description: "Anthropic via Ozwell" },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", description: "Fast Anthropic" },
];

export interface PartitionOzwellModelsResult {
  /** Curated recommendations present in `available` (plus pinned current if needed) */
  recommended: ProviderModel[];
  /** Remaining model ids, sorted */
  other: string[];
}

/**
 * Split an Ozwell model list into recommended (curated order) + other.
 * If `currentModelId` is available but not curated, it is pinned to the top of recommended.
 */
export function partitionOzwellModels(
  available: string[],
  currentModelId?: string
): PartitionOzwellModelsResult {
  const availableSet = new Set(available);
  const used = new Set<string>();
  const recommended: ProviderModel[] = [];

  if (currentModelId && availableSet.has(currentModelId)) {
    const curated = OZWELL_RECOMMENDED_MODELS.find((m) => m.id === currentModelId);
    if (curated) {
      recommended.push(curated);
    } else {
      recommended.push({
        id: currentModelId,
        name: currentModelId,
        description: "Current selection",
      });
    }
    used.add(currentModelId);
  }

  for (const m of OZWELL_RECOMMENDED_MODELS) {
    if (used.has(m.id) || !availableSet.has(m.id)) continue;
    recommended.push(m);
    used.add(m.id);
  }

  const other = available.filter((id) => !used.has(id)).sort((a, b) => a.localeCompare(b));
  return { recommended, other };
}

/**
 * Curated model list for OpenAI direct.
 */
const OPENAI_MODELS: ProviderModel[] = [
  { id: "gpt-4o", name: "GPT-4o", description: "Multimodal flagship" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", description: "Efficient multimodal" },
  { id: "gpt-4-turbo", name: "GPT-4 Turbo", description: "Previous generation" },
  { id: "gpt-4", name: "GPT-4", description: "Original GPT-4" },
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", description: "Fast, economical" },
  { id: "o1-preview", name: "o1 Preview", description: "Reasoning model" },
  { id: "o1-mini", name: "o1 Mini", description: "Efficient reasoning" },
];

/**
 * Curated model list for Moonshot/Kimi.
 */
const MOONSHOT_MODELS: ProviderModel[] = [
  { id: "moonshot-v1-8k", name: "Moonshot v1 8K", description: "8K context" },
  { id: "moonshot-v1-32k", name: "Moonshot v1 32K", description: "32K context" },
  { id: "moonshot-v1-128k", name: "Moonshot v1 128K", description: "128K context" },
];

/**
 * Provider registry - all supported providers.
 */
export const PROVIDERS: ProviderDefinition[] = [
  {
    id: "ollama",
    name: "Ollama (Local)",
    runtime: "local",
    models: [],
    supportsModelList: true,
  },
  {
    id: "ozwell",
    name: "Ozwell",
    runtime: "ozwell",
    baseURL: "https://ozwellapi.os.mieweb.org",
    docsURL: "https://mieweb.github.io/ozwellai-api/backend/api-authentication/",
    keyPrefix: "ozw_",
    models: OZWELL_RECOMMENDED_MODELS,
    supportsModelList: true,
  },
  {
    id: "openai",
    name: "OpenAI",
    runtime: "byo-cloud",
    byoProvider: "openai",
    baseURL: "https://api.openai.com/v1",
    docsURL: "https://platform.openai.com/api-keys",
    keyPrefix: "sk-",
    models: OPENAI_MODELS,
  },
  {
    id: "moonshot",
    name: "Moonshot / Kimi",
    runtime: "byo-cloud",
    byoProvider: "moonshot",
    baseURL: "https://api.moonshot.cn/v1",
    docsURL: "https://platform.moonshot.cn/console/api-keys",
    models: MOONSHOT_MODELS,
  },
  {
    id: "custom",
    name: "Custom OpenAI-compatible",
    runtime: "byo-cloud",
    byoProvider: "custom",
    models: [],
    supportsModelList: true,
  },
];

/**
 * Get provider definition by ID.
 */
export function getProvider(id: string): ProviderDefinition | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/**
 * Get provider for a runtime + optional BYO provider.
 */
export function getProviderForRuntime(
  runtime: RuntimeKind,
  byoProvider?: ByoProviderId
): ProviderDefinition | undefined {
  if (runtime === "local") {
    return PROVIDERS.find((p) => p.id === "ollama");
  }
  if (runtime === "ozwell") {
    return PROVIDERS.find((p) => p.id === "ozwell");
  }
  if (runtime === "byo-cloud" && byoProvider) {
    return PROVIDERS.find((p) => p.byoProvider === byoProvider);
  }
  return undefined;
}

/**
 * Get all BYO providers.
 */
export function getByoProviders(): ProviderDefinition[] {
  return PROVIDERS.filter((p) => p.runtime === "byo-cloud");
}

/**
 * Convert a provider + model selection to wire format for the bridge.
 *
 * Wire formats:
 * - local: `ollama:<modelId>`
 * - ozwell: bare model id (e.g. `gpt-4.1-mini`)
 * - byo-cloud: `https://<baseURL>#<modelId>`
 */
export function toWireModel(
  runtime: RuntimeKind,
  modelId: string,
  baseURL?: string
): string {
  if (runtime === "local") {
    if (modelId.startsWith("ollama:")) {
      return modelId;
    }
    return `ollama:${modelId}`;
  }

  if (runtime === "ozwell") {
    if (modelId.startsWith("ollama:")) {
      return modelId.slice("ollama:".length);
    }
    if (modelId.startsWith("http://") || modelId.startsWith("https://")) {
      const hash = modelId.indexOf("#");
      return hash !== -1 ? modelId.slice(hash + 1) : modelId;
    }
    return modelId;
  }

  if (runtime === "byo-cloud") {
    if (modelId.startsWith("http://") || modelId.startsWith("https://")) {
      return modelId;
    }
    const url = baseURL ?? "https://api.openai.com/v1";
    return `${url}#${modelId}`;
  }

  return modelId;
}

/**
 * Parse a wire model back to provider model ID.
 * Returns the bare model ID without provider/URL prefix.
 */
export function fromWireModel(wireModel: string): string {
  if (wireModel.startsWith("ollama:")) {
    return wireModel.slice("ollama:".length);
  }

  if (wireModel.startsWith("http://") || wireModel.startsWith("https://")) {
    const hash = wireModel.indexOf("#");
    return hash !== -1 ? wireModel.slice(hash + 1) : wireModel;
  }

  return wireModel;
}

/**
 * Extract base URL from wire model (for byo-cloud).
 */
export function getBaseURLFromWireModel(wireModel: string): string | undefined {
  if (wireModel.startsWith("http://") || wireModel.startsWith("https://")) {
    const hash = wireModel.indexOf("#");
    return hash !== -1 ? wireModel.slice(0, hash) : wireModel;
  }
  return undefined;
}

/**
 * Default model for each provider.
 */
export const DEFAULT_MODELS: Record<string, string> = {
  ollama: "llama3.1:8b",
  ozwell: "gpt-4.1-mini",
  openai: "gpt-4o",
  moonshot: "moonshot-v1-8k",
  custom: "",
};

/**
 * Get the default model for a provider.
 */
export function getDefaultModel(providerId: string): string {
  return DEFAULT_MODELS[providerId] ?? "";
}
