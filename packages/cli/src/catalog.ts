/**
 * What runtimes Jerry can use, and which models live in each.
 *
 * `/runtime` and `/model` are the only ways to change this, so the catalog's
 * job is twofold: resolve a name the user typed, and describe what is on offer
 * when they typed nothing or something unknown. Every entry records the
 * environment variable holding its key, which is what lets the REPL say
 * "OPENAI_API_KEY isn't set" instead of failing a turn with an HTTP 401.
 */

/** Anthropic serves an OpenAI-compatible surface at this base URL. */
export const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1";
export const OPENAI_ENDPOINT = "https://api.openai.com/v1";

export type RuntimeId = "local" | "byo-cloud" | "ozwell";

export interface RuntimeInfo {
  id: RuntimeId;
  /** One line for the `/runtime` hint list. */
  summary: string;
  /** Other spellings accepted by `/runtime`. */
  aliases: string[];
}

export interface ModelInfo {
  /** Provider model id, as listed by `/model` and typed by the user. */
  id: string;
  displayName: string;
  runtime: RuntimeId;
  /** Base URL, for byo-cloud. */
  endpoint?: string;
  /** Environment variable holding the key, when the model needs one. */
  requiredEnvKey?: string;
  /** Shorthands accepted by `/model`. */
  aliases: string[];
}

export const RUNTIMES: RuntimeInfo[] = [
  {
    id: "local",
    summary: "Ollama on this machine, nothing leaves",
    aliases: ["ollama"],
  },
  {
    id: "byo-cloud",
    summary: "Anthropic or OpenAI, with your own key",
    aliases: ["byocloud", "byo", "cloud"],
  },
  {
    id: "ozwell",
    summary: "Ozwell Manager",
    aliases: [],
  },
];

/**
 * Anthropic and OpenAI ids use the undated aliases (`claude-sonnet-5`,
 * `gpt-5.6-sol`) so the catalog does not go stale every time a snapshot ships.
 *
 * Order within a runtime matters: `/runtime <name>` lands on the first model
 * whose key is present.
 */
export const MODELS: ModelInfo[] = [
  {
    id: "llama3.1:8b",
    displayName: "Llama 3.1 8B",
    runtime: "local",
    aliases: ["llama", "llama3.1", "llama3"],
  },
  {
    id: "qwen2.5:3b",
    displayName: "Qwen 2.5 3B",
    runtime: "local",
    aliases: ["qwen", "qwen2.5"],
  },

  // byo-cloud — Anthropic
  {
    id: "claude-sonnet-5",
    displayName: "Claude Sonnet 5",
    runtime: "byo-cloud",
    endpoint: ANTHROPIC_ENDPOINT,
    requiredEnvKey: "ANTHROPIC_API_KEY",
    aliases: ["sonnet", "sonnet-5", "sonnet 5", "claude", "claude-sonnet"],
  },
  {
    id: "claude-opus-5",
    displayName: "Claude Opus 5",
    runtime: "byo-cloud",
    endpoint: ANTHROPIC_ENDPOINT,
    requiredEnvKey: "ANTHROPIC_API_KEY",
    aliases: ["opus", "opus-5", "opus 5", "claude-opus"],
  },
  {
    id: "claude-opus-4-8",
    displayName: "Claude Opus 4.8",
    runtime: "byo-cloud",
    endpoint: ANTHROPIC_ENDPOINT,
    requiredEnvKey: "ANTHROPIC_API_KEY",
    aliases: ["opus-4.8", "opus 4.8"],
  },
  {
    id: "claude-opus-4-5",
    displayName: "Claude Opus 4.5",
    runtime: "byo-cloud",
    endpoint: ANTHROPIC_ENDPOINT,
    requiredEnvKey: "ANTHROPIC_API_KEY",
    aliases: ["opus-4.5", "opus 4.5"],
  },

  // byo-cloud — OpenAI (GPT-5.6 family)
  {
    id: "gpt-5.6-sol",
    displayName: "GPT-5.6 Sol",
    runtime: "byo-cloud",
    endpoint: OPENAI_ENDPOINT,
    requiredEnvKey: "OPENAI_API_KEY",
    aliases: ["gpt", "gpt-5.6", "sol", "5.6-sol"],
  },
  {
    id: "gpt-5.6-terra",
    displayName: "GPT-5.6 Terra",
    runtime: "byo-cloud",
    endpoint: OPENAI_ENDPOINT,
    requiredEnvKey: "OPENAI_API_KEY",
    aliases: ["terra", "5.6-terra", "gpt-mini"],
  },
  {
    id: "gpt-5.6-luna",
    displayName: "GPT-5.6 Luna",
    runtime: "byo-cloud",
    endpoint: OPENAI_ENDPOINT,
    requiredEnvKey: "OPENAI_API_KEY",
    aliases: ["luna", "5.6-luna"],
  },

  // ozwell — Claude + GPT-5.6 on the Manager host
  {
    id: "claude-opus-5",
    displayName: "Claude Opus 5",
    runtime: "ozwell",
    requiredEnvKey: "OZWELL_API_KEY",
    aliases: ["opus", "opus-5", "opus 5", "claude-opus"],
  },
  {
    id: "claude-fable-5",
    displayName: "Claude Fable 5",
    runtime: "ozwell",
    requiredEnvKey: "OZWELL_API_KEY",
    aliases: ["fable", "fabel", "fable-5", "fabel-5", "fable 5", "fabel 5"],
  },
  {
    id: "claude-opus-4-8",
    displayName: "Claude Opus 4.8",
    runtime: "ozwell",
    requiredEnvKey: "OZWELL_API_KEY",
    aliases: ["opus-4.8", "opus 4.8"],
  },
  {
    id: "claude-opus-4-5",
    displayName: "Claude Opus 4.5",
    runtime: "ozwell",
    requiredEnvKey: "OZWELL_API_KEY",
    aliases: ["opus-4.5", "opus 4.5"],
  },
  {
    id: "gpt-5.6-sol",
    displayName: "GPT-5.6 Sol",
    runtime: "ozwell",
    requiredEnvKey: "OZWELL_API_KEY",
    aliases: ["gpt", "gpt-5.6", "sol", "5.6-sol"],
  },
  {
    id: "gpt-5.6-terra",
    displayName: "GPT-5.6 Terra",
    runtime: "ozwell",
    requiredEnvKey: "OZWELL_API_KEY",
    aliases: ["terra", "5.6-terra", "gpt-mini"],
  },
  {
    id: "gpt-5.6-luna",
    displayName: "GPT-5.6 Luna",
    runtime: "ozwell",
    requiredEnvKey: "OZWELL_API_KEY",
    aliases: ["luna", "5.6-luna"],
  },
];

/**
 * Everything but letters and digits removed, so `claude-opus-4-8`,
 * "Claude Opus 4.8" and "claude_opus_4_8" all collapse to one key.
 */
function compact(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** The runtime a profile is currently on, falling back to the documented default. */
export function currentRuntimeId(runtime?: string): RuntimeId {
  const found = RUNTIMES.find((entry) => entry.id === runtime);
  return found?.id ?? "local";
}

export function findRuntime(target: string): RuntimeInfo | null {
  const key = compact(target);
  if (!key) return null;
  return (
    RUNTIMES.find(
      (entry) =>
        compact(entry.id) === key || entry.aliases.some((a) => compact(a) === key)
    ) ?? null
  );
}

export function modelsForRuntime(runtime: RuntimeId): ModelInfo[] {
  return MODELS.filter((model) => model.runtime === runtime);
}

/**
 * Resolve a model name, optionally restricted to one runtime.
 *
 * @param runtime - When given, only models in that runtime are considered, so
 *   `/model` can report that a name exists but lives somewhere else.
 */
export function findModel(
  target: string,
  runtime?: RuntimeId
): ModelInfo | null {
  const key = compact(target);
  if (!key) return null;
  const pool = runtime ? modelsForRuntime(runtime) : MODELS;
  return (
    pool.find(
      (model) =>
        compact(model.id) === key || model.aliases.some((a) => compact(a) === key)
    ) ?? null
  );
}

/**
 * A model reference the user spelled out in full, e.g. `ollama:mistral` or
 * `https://api.groq.com/openai/v1#llama-3.1-70b`.
 *
 * The escape hatch that keeps the catalog from being a ceiling: any Ollama
 * model you have pulled, or any OpenAI-compatible endpoint, is reachable
 * without waiting for a catalog entry.
 */
export function parseModelRef(target: string): ModelInfo | null {
  const trimmed = target.trim();

  const ollama = trimmed.match(/^ollama:(\S+)$/i);
  if (ollama) {
    return {
      id: ollama[1],
      displayName: `${ollama[1]} (local)`,
      runtime: "local",
      aliases: [],
    };
  }

  const url = trimmed.match(/^(https?:\/\/\S+)#(\S+)$/i);
  if (url) {
    const [, endpoint, id] = url;
    return {
      id,
      displayName: id,
      runtime: "byo-cloud",
      endpoint,
      requiredEnvKey: endpoint.includes("anthropic.com")
        ? "ANTHROPIC_API_KEY"
        : "OPENAI_API_KEY",
      aliases: [],
    };
  }

  return null;
}

/**
 * The key a model needs, read from the CLI's own environment.
 *
 * The CLI forwards this to the worker in the profile, so a switch works even
 * when the worker process was started without the key in scope.
 *
 * @returns the key, or `undefined` when the model needs none (local) or the
 *   environment variable is unset.
 */
export function resolveModelApiKey(
  model: ModelInfo,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  if (!model.requiredEnvKey) return undefined;

  if (model.runtime === "ozwell") {
    return env.OZWELL_API_KEY ?? env.OZWELL_AGENT_KEY ?? env.JERRY_API_KEY;
  }

  // JERRY_API_KEY is the documented generic override for cloud runtimes.
  return env[model.requiredEnvKey] ?? env.JERRY_API_KEY;
}

export function isModelReady(
  model: ModelInfo,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return !model.requiredEnvKey || Boolean(resolveModelApiKey(model, env));
}

/**
 * Whether a runtime is usable, and what is missing when it is not.
 *
 * A runtime is usable as soon as one of its models has a key, since
 * `/runtime` picks a usable model when it switches.
 */
export function describeRuntimeReadiness(
  runtime: RuntimeId,
  env: NodeJS.ProcessEnv = process.env
): { ready: boolean; missing: string[] } {
  const models = modelsForRuntime(runtime);
  if (models.some((model) => isModelReady(model, env))) {
    return { ready: true, missing: [] };
  }

  const missing: string[] = [];
  for (const model of models) {
    if (model.requiredEnvKey && !missing.includes(model.requiredEnvKey)) {
      missing.push(model.requiredEnvKey);
    }
  }
  return { ready: false, missing };
}

/**
 * The model `/runtime <name>` lands on: the first one whose key is present, so
 * switching runtime does not strand the session on a model it cannot call.
 */
export function defaultModelForRuntime(
  runtime: RuntimeId,
  env: NodeJS.ProcessEnv = process.env
): ModelInfo | null {
  const models = modelsForRuntime(runtime);
  return models.find((model) => isModelReady(model, env)) ?? models[0] ?? null;
}

/**
 * Build the `profile.model` string the worker's own `parseModelRef` expects.
 */
export function toProfileModel(model: ModelInfo): string {
  if (model.runtime === "local") {
    return model.id.startsWith("ollama:") ? model.id : `ollama:${model.id}`;
  }
  if (model.runtime === "byo-cloud") {
    return `${model.endpoint}#${model.id}`;
  }
  return model.id;
}

/**
 * The escape-hatch syntax worth mentioning for a given runtime, if any.
 */
export function refHintForRuntime(runtime: RuntimeId): string | null {
  if (runtime === "local") return "ollama:<name> for any model you have pulled";
  if (runtime === "byo-cloud") return "https://host/v1#<model> for another endpoint";
  return null;
}
