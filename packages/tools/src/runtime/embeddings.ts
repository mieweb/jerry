/**
 * Embedding utilities — shared between search_memory and index_document.
 *
 * Calls Ollama's /api/embeddings endpoint directly using nomic-embed-text
 * (768 dimensions). No external package dependency — keeps CI hermetic.
 */

export interface EmbedderConfig {
  model?: string;
  baseUrl?: string;
  dimension?: number;
}

const DEFAULT_MODEL = "nomic-embed-text";
const DEFAULT_BASE_URL = "http://localhost:11434";

/**
 * No-op kept for test compatibility (previously reset a cached embedder).
 */
export function resetEmbedder(): void {}

/**
 * Generate an embedding for a text string using Ollama.
 *
 * @param text - The text to embed
 * @param config - Optional model / baseUrl / dimension overrides
 * @returns The embedding vector or null on failure
 */
export async function getEmbedding(
  text: string,
  config?: Partial<EmbedderConfig>
): Promise<number[] | null> {
  const baseUrl = config?.baseUrl ?? DEFAULT_BASE_URL;
  const model = config?.model ?? DEFAULT_MODEL;

  try {
    const response = await fetch(`${baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { embedding?: number[] };
    return data.embedding ?? null;
  } catch (err) {
    console.error(
      `Embedding error: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

/**
 * Check if Ollama is available and ready.
 *
 * @param baseUrl - Optional custom Ollama base URL
 * @returns true if Ollama is reachable, false otherwise
 */
export async function isOllamaAvailable(baseUrl?: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const url = baseUrl ?? DEFAULT_BASE_URL;
    const response = await fetch(`${url}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    return response.ok;
  } catch {
    return false;
  }
}
