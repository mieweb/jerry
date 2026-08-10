import type { PrivacyProfile } from "./types.ts";

/**
 * Default Ozwell API endpoint (Manager host).
 * Use ozwellapi.os.mieweb.org for Ozwell Manager keys (ozw_ / agnt_key-).
 */
export const DEFAULT_OZWELL_ENDPOINT = "https://ozwellapi.os.mieweb.org";

/**
 * Default model when runtime is ozwell and profile.model is still an ollama: ref.
 * Parent `ozw_` keys should use this OpenAI-compatible model id on the Manager host.
 */
export const DEFAULT_OZWELL_MODEL = "gpt-4.1-mini";

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
    model: "ollama:llama3.1:8b",
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
        read_drive: "ask",
        post_youtube: "ask",
        fetch_youtube: "ask",
        fetch_youtube_transcript: "ask",
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
            throw new Error(
                `Invalid ollama model reference: "${model}" (missing model name)`,
            );
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
                `Invalid URL model reference: "${model}" (missing #<model> suffix)`,
            );
        }
        const baseURL = model.slice(0, hashIndex);
        const modelId = model.slice(hashIndex + 1);
        if (!modelId) {
            throw new Error(
                `Invalid URL model reference: "${model}" (missing model name after #)`,
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
            `Expected "ollama:<model>" or "https://<url>#<model>".`,
    );
}

/**
 * Merge a partial profile with defaults.
 * Shallow merge: tools object is replaced entirely if provided.
 */
export function mergeProfile(
    partial?: Partial<PrivacyProfile>,
): PrivacyProfile {
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
 * Priority for ozwell: profile.apiKey → OZWELL_API_KEY → OZWELL_AGENT_KEY
 *
 * Parent `ozw_` keys are preferred for Jerry: Ozwell is only the model endpoint,
 * and Jerry keeps the local tool loop. Agent keys (`agnt_key-`) inject Ozwell-side
 * persona/tools that conflict with Jerry tools (often "please provide ActivityWatch data").
 *
 * @param profile - Privacy profile
 * @returns API key or undefined if not found
 */
export function resolveApiKey(profile: PrivacyProfile): string | undefined {
    if (profile.apiKey) {
        return profile.apiKey;
    }

    if (profile.runtime === "ozwell") {
        // Prefer parent key so Jerry's local tools remain authoritative
        return process.env.OZWELL_API_KEY ?? process.env.OZWELL_AGENT_KEY;
    }

    if (profile.runtime === "byo-cloud") {
        return process.env.JERRY_API_KEY ?? process.env.OPENAI_API_KEY;
    }

    return undefined;
}

/**
 * Resolve the Ozwell model id from a privacy profile.
 * Maps leftover `ollama:` defaults (from mergeProfile) to DEFAULT_OZWELL_MODEL.
 */
export function resolveOzwellModelId(profile: PrivacyProfile): string {
    const model = profile.model ?? "";
    if (model.includes("#")) {
        return model.split("#")[1] || DEFAULT_OZWELL_MODEL;
    }
    if (model.startsWith("ollama:") || !model) {
        return DEFAULT_OZWELL_MODEL;
    }
    return model;
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
