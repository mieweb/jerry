/**
 * Embedding utilities — shared between search_memory and index_document.
 *
 * Uses Ollama's /api/embeddings endpoint with nomic-embed-text model (768 dimensions).
 */

export interface EmbeddingConfig {
  ollamaUrl?: string;
  model?: string;
}

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "nomic-embed-text";

/**
 * Generate an embedding for a text string using Ollama.
 *
 * @param text - The text to embed
 * @param config - Optional configuration for Ollama URL and model
 * @returns The embedding vector (768 dimensions for nomic-embed-text) or null on failure
 */
export async function getEmbedding(
  text: string,
  config: EmbeddingConfig = {}
): Promise<number[] | null> {
  const ollamaUrl = config.ollamaUrl ?? DEFAULT_OLLAMA_URL;
  const model = config.model ?? DEFAULT_MODEL;

  try {
    const res = await fetch(`${ollamaUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text }),
    });

    if (!res.ok) {
      console.error(`Ollama embedding request failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = (await res.json()) as { embedding?: number[] };
    return data.embedding ?? null;
  } catch (err) {
    console.error(`Ollama embedding error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * Check if Ollama is available and the embedding model is ready.
 *
 * @param config - Optional configuration for Ollama URL and model
 * @returns true if Ollama is available, false otherwise
 */
export async function isOllamaAvailable(config: EmbeddingConfig = {}): Promise<boolean> {
  const ollamaUrl = config.ollamaUrl ?? DEFAULT_OLLAMA_URL;

  try {
    const res = await fetch(`${ollamaUrl}/api/tags`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}
