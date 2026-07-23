/**
 * Fetch available models from OpenAI API (/v1/models).
 * No static fallback — invalid key or service issues surface as errors.
 */

export interface ListOpenAIModelsOptions {
  apiKey?: string;
  baseURL?: string;
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
}

export type ErrorKind = "auth" | "unavailable" | "other";

export interface ListOpenAIModelsResult {
  ok: boolean;
  models: string[];
  error?: string;
  errorKind?: ErrorKind;
}

interface OpenAIModelsResponse {
  data?: Array<{ id?: string; object?: string }>;
}

const DEFAULT_OPENAI_URL = "https://api.openai.com/v1";

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
 * List OpenAI models via GET {baseURL}/models.
 * No fallback catalog — errors are surfaced for the picker to display.
 */
export async function listOpenAIModels(
  opts?: ListOpenAIModelsOptions
): Promise<ListOpenAIModelsResult> {
  const apiKey = opts?.apiKey?.trim();
  const baseURL = (opts?.baseURL ?? DEFAULT_OPENAI_URL).replace(/\/$/, "");
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
    const url = baseURL.endsWith("/v1")
      ? `${baseURL}/models`
      : `${baseURL}/v1/models`;

    const response = await fetchFn(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
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

    const data = (await response.json()) as OpenAIModelsResponse;
    const models = (data.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .sort((a, b) => a.localeCompare(b));

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
