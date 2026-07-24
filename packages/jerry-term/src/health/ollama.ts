/**
 * Ollama health check adapter.
 *
 * Probes the Ollama API to verify it's running and reports available models.
 */

import type { HealthCheck, HealthCheckOptions, HealthResult } from "./types.ts";

const DEFAULT_BASE_URL = "http://127.0.0.1:11434";

interface OllamaTagsResponse {
  models?: Array<{ name: string }>;
}

export interface OllamaCheckOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
}

export interface ListOllamaModelsOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
}

export interface ListOllamaModelsResult {
  ok: boolean;
  models: string[];
  error?: string;
}

/**
 * Fetch installed Ollama model names from GET /api/tags.
 */
export async function listOllamaModels(
  opts?: ListOllamaModelsOptions
): Promise<ListOllamaModelsResult> {
  const baseUrl = opts?.baseUrl ?? DEFAULT_BASE_URL;
  const fetchFn = opts?.fetchFn ?? fetch;

  try {
    const response = await fetchFn(`${baseUrl}/api/tags`, {
      signal: opts?.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        models: [],
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = (await response.json()) as OllamaTagsResponse;
    const models = (data.models ?? []).map((m) => m.name).filter(Boolean);

    return { ok: true, models };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    return {
      ok: false,
      models: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function createOllamaCheck(opts?: OllamaCheckOptions): HealthCheck {
  const baseUrl = opts?.baseUrl ?? DEFAULT_BASE_URL;
  const fetchFn = opts?.fetchFn ?? fetch;

  return {
    name: "Ollama",
    description: "Local LLM inference server",
    required: true,

    async check(options?: HealthCheckOptions): Promise<HealthResult> {
      const listed = await listOllamaModels({
        baseUrl,
        fetchFn,
        signal: options?.signal,
      });

      if (!listed.ok) {
        const isHttp = listed.error?.startsWith("HTTP ");
        return {
          status: "error",
          message: isHttp ? (listed.error ?? "Error") : "Not running",
          details: isHttp ? undefined : { error: listed.error },
        };
      }

      const modelCount = listed.models.length;
      return {
        status: "ok",
        message: `Running with ${modelCount} model${modelCount !== 1 ? "s" : ""} available`,
        details: {
          modelCount,
          models: listed.models,
        },
      };
    },
  };
}
