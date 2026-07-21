import type { PrivacyProfile } from "./types.ts";

/**
 * Default Ozwell API endpoint (Manager host).
 * Use ozwellapi.os.mieweb.org for Ozwell Manager keys (ozw_ / agnt_key-).
 */
export const DEFAULT_OZWELL_ENDPOINT = "https://ozwellapi.os.mieweb.org";

/**
 * Parsed model reference with provider info.
 */
export interface ParsedModelRef {
  /** Provider name (e.g. "ollama", "openai-compatible") */
  provider: string;
  /** Base URL for the API */
  baseURL: string;
  /** Model ID to use */
  modelId: string;
  /** API key if extracted from URL (for byo-cloud) */
  apiKey?: string;
}

/**
 * Default privacy profile: fully local, nothing leaves the machine.
 * Uses Ollama with qwen2.5 model and denies all network egress.
 */
export const DEFAULT_PRIVACY_PROFILE: PrivacyProfile = {
  runtime: "local",
  model: "ollama:qwen2.5",
  egress: "deny",
  tools: {
    summarize_activity: "local",
    search_memory: "local",
    schedule_followup: "local",
    read_file: "local",
    list_watched: "local",
    index_document: "local",
    search_hybrid: "local",
    search_fts: "local",
    search_literal: "local",
    read_document: "local",
    drive: "ask",
    youtube: "ask",
  },
};

/**
 * Parse a model reference string into provider details.
 *
 * Supported formats:
 * - `ollama:<model>` → local Ollama at localhost:11434
 * - `https://<url>#<model>` → OpenAI-compatible endpoint (for byo-cloud)
 *
 * @example
 * parseModelRef("ollama:qwen2.5")
 * // { provider: "ollama", baseURL: "http://127.0.0.1:11434/v1", modelId: "qwen2.5" }
 *
 * parseModelRef("https://api.openai.com/v1#gpt-4o")
 * // { provider: "openai-compatible", baseURL: "https://api.openai.com/v1", modelId: "gpt-4o" }
 */
export function parseModelRef(model: string): ParsedModelRef {
  // Ollama format: "ollama:<model>"
  if (model.startsWith("ollama:")) {
    const modelId = model.slice("ollama:".length);
    if (!modelId) {
      throw new Error(`Invalid ollama model reference: "${model}" (missing model name)`);
    }
    return {
      provider: "ollama",
      baseURL: "http://127.0.0.1:11434/v1",
      modelId,
    };
  }

  // URL format: "https://<url>#<model>" (for byo-cloud)
  if (model.startsWith("http://") || model.startsWith("https://")) {
    const hashIndex = model.indexOf("#");
    if (hashIndex === -1) {
      throw new Error(
        `Invalid URL model reference: "${model}" (missing #<model> suffix)`
      );
    }
    const baseURL = model.slice(0, hashIndex);
    const modelId = model.slice(hashIndex + 1);
    if (!modelId) {
      throw new Error(
        `Invalid URL model reference: "${model}" (missing model name after #)`
      );
    }
    return {
      provider: "openai-compatible",
      baseURL,
      modelId,
    };
  }

  throw new Error(
    `Unsupported model reference format: "${model}". ` +
      `Expected "ollama:<model>" or "https://<url>#<model>".`
  );
}

/**
 * Merge a partial profile with defaults.
 * Shallow merge: tools object is replaced entirely if provided.
 */
export function mergeProfile(partial?: Partial<PrivacyProfile>): PrivacyProfile {
  if (!partial) {
    return { ...DEFAULT_PRIVACY_PROFILE };
  }
  return {
    ...DEFAULT_PRIVACY_PROFILE,
    ...partial,
    // Ensure tools is properly merged (replace entirely if provided)
    tools: partial.tools ?? DEFAULT_PRIVACY_PROFILE.tools,
  };
}

/**
 * Resolve API key from profile or environment variables.
 *
 * Priority for byo-cloud: profile.apiKey → JERRY_API_KEY → OPENAI_API_KEY
 * Priority for ozwell: profile.apiKey → OZWELL_AGENT_KEY → OZWELL_API_KEY
 *
 * @param profile - Privacy profile
 * @returns API key or undefined if not found
 */
export function resolveApiKey(profile: PrivacyProfile): string | undefined {
  if (profile.apiKey) {
    return profile.apiKey;
  }

  if (profile.runtime === "ozwell") {
    // Agent key takes precedence for ozwell (scoped to agent)
    return (
      process.env.OZWELL_AGENT_KEY ??
      process.env.OZWELL_API_KEY
    );
  }

  if (profile.runtime === "byo-cloud") {
    return (
      process.env.JERRY_API_KEY ??
      process.env.OPENAI_API_KEY
    );
  }

  return undefined;
}

/**
 * Normalize profile egress for cloud runtimes.
 *
 * When runtime is byo-cloud or ozwell and egress was left at default "deny",
 * coerce to "allow-model" so model calls are permitted without requiring
 * callers to explicitly set egress.
 */
export function normalizeProfile(profile: PrivacyProfile): PrivacyProfile {
  // If using cloud runtime with default deny egress, upgrade to allow-model
  if (
    (profile.runtime === "byo-cloud" || profile.runtime === "ozwell") &&
    profile.egress === "deny"
  ) {
    return { ...profile, egress: "allow-model" };
  }
  return profile;
}
