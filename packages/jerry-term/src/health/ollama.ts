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

export function createOllamaCheck(opts?: OllamaCheckOptions): HealthCheck {
  const baseUrl = opts?.baseUrl ?? DEFAULT_BASE_URL;
  const fetchFn = opts?.fetchFn ?? fetch;

  return {
    name: "Ollama",
    description: "Local LLM inference server",
    required: true,

    async check(options?: HealthCheckOptions): Promise<HealthResult> {
      try {
        const response = await fetchFn(`${baseUrl}/api/tags`, {
          signal: options?.signal,
        });

        if (!response.ok) {
          return {
            status: "error",
            message: `HTTP ${response.status}: ${response.statusText}`,
          };
        }

        const data = (await response.json()) as OllamaTagsResponse;
        const modelCount = data.models?.length ?? 0;

        return {
          status: "ok",
          message: `Running with ${modelCount} model${modelCount !== 1 ? "s" : ""} available`,
          details: {
            modelCount,
            models: data.models?.map((m) => m.name) ?? [],
          },
        };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }
        return {
          status: "error",
          message: "Not running",
          details: {
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
  };
}
