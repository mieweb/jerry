/**
 * Fetch available models from Anthropic API (/v1/models).
 * No static fallback — invalid key or service issues surface as errors.
 */

import type { ErrorKind } from "./list-openai-models.ts";

export interface ListAnthropicModelsOptions {
  apiKey?: string;
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
}

export interface AnthropicModelInfo {
  id: string;
  displayName?: string;
}

export interface ListAnthropicModelsResult {
  ok: boolean;
  models: AnthropicModelInfo[];
  error?: string;
  errorKind?: ErrorKind;
}

interface AnthropicModelsResponse {
  data?: Array<{
    id?: string;
    display_name?: string;
    type?: string;
  }>;
}

const ANTHROPIC_API_URL = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";

function classifyError(status: number): ErrorKind {
  if (status === 401 || status === 403) {
    return "auth";
  }
  if (status >= 500 || status === 0) {
    return "unavailable";
  }
  return "other";
}

function classifyFetchError(error: unknown): ErrorKind {
  if (!(error instanceof Error)) return "other";
  const msg = error.message.toLowerCase();

  if (
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("socket hang up")
  ) {
    return "unavailable";
  }

  return "other";
}

/**
 * List Anthropic models via GET /v1/models with x-api-key header.
 * No fallback catalog — errors are surfaced for the picker to display.
 */
export async function listAnthropicModels(
  opts?: ListAnthropicModelsOptions
): Promise<ListAnthropicModelsResult> {
  const apiKey = opts?.apiKey?.trim();
  const fetchFn = opts?.fetchFn ?? fetch;

  if (!apiKey) {
    return {
      ok: false,
      models: [],
      error: "No API key",
      errorKind: "auth",
    };
  }

  try {
    const response = await fetchFn(`${ANTHROPIC_API_URL}/v1/models`, {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        Accept: "application/json",
      },
      signal: opts?.signal,
    });

    if (!response.ok) {
      const errorKind = classifyError(response.status);
      let errorMsg = `HTTP ${response.status}`;
      if (errorKind === "auth") {
        errorMsg = "Invalid API key";
      } else if (errorKind === "unavailable") {
        errorMsg = "Service unavailable";
      }
      return {
        ok: false,
        models: [],
        error: errorMsg,
        errorKind,
      };
    }

    const data = (await response.json()) as AnthropicModelsResponse;
    const models = (data.data ?? [])
      .filter(
        (m): m is { id: string; display_name?: string; type?: string } =>
          typeof m.id === "string" && m.id.length > 0
      )
      .map((m) => ({
        id: m.id,
        displayName: m.display_name,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    if (models.length === 0) {
      return {
        ok: false,
        models: [],
        error: "Empty model list",
        errorKind: "other",
      };
    }

    return { ok: true, models };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw error;
    }
    const errorKind = classifyFetchError(error);
    return {
      ok: false,
      models: [],
      error:
        errorKind === "unavailable"
          ? "Service unavailable"
          : error instanceof Error
            ? error.message
            : String(error),
      errorKind,
    };
  }
}
