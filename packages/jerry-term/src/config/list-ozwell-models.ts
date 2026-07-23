/**
 * Fetch available models from Ozwell Manager (/v1/models).
 * Falls back to curated static list when the API is unavailable or empty.
 */

import { getProvider } from "./providers.ts";

export interface ListOzwellModelsOptions {
  apiKey?: string;
  endpoint?: string;
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
}

export interface ListOzwellModelsResult {
  ok: boolean;
  models: string[];
  error?: string;
  /** True when curated static list was used instead of a live API response */
  usedFallback: boolean;
}

interface OpenAIModelsResponse {
  data?: Array<{ id?: string; object?: string }>;
}

const DEFAULT_ENDPOINT = "https://ozwellapi.os.mieweb.org";

function curatedOzwellModelIds(): string[] {
  return (getProvider("ozwell")?.models ?? []).map((m) => m.id);
}

/**
 * List Ozwell models via OpenAI-compatible GET {endpoint}/v1/models.
 * On failure or empty data, returns the curated static catalog as fallback.
 */
export async function listOzwellModels(
  opts?: ListOzwellModelsOptions
): Promise<ListOzwellModelsResult> {
  const fallback = curatedOzwellModelIds();
  const apiKey = opts?.apiKey?.trim();
  const endpoint = (opts?.endpoint ?? DEFAULT_ENDPOINT).replace(/\/$/, "");
  const fetchFn = opts?.fetchFn ?? fetch;

  if (!apiKey) {
    return {
      ok: false,
      models: fallback,
      error: "No Ozwell API key",
      usedFallback: true,
    };
  }

  try {
    const response = await fetchFn(`${endpoint}/v1/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: opts?.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        models: fallback,
        error: `HTTP ${response.status}: ${response.statusText}`,
        usedFallback: true,
      };
    }

    const data = (await response.json()) as OpenAIModelsResponse;
    const models = (data.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .sort((a, b) => a.localeCompare(b));

    if (models.length === 0) {
      return {
        ok: false,
        models: fallback,
        error: "Empty model list from Ozwell",
        usedFallback: true,
      };
    }

    return { ok: true, models, usedFallback: false };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    return {
      ok: false,
      models: fallback,
      error: error instanceof Error ? error.message : String(error),
      usedFallback: true,
    };
  }
}
