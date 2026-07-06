/**
 * Embedding utilities — shared between search_memory and index_document.
 *
 * Uses footnote's embedder infrastructure which provides:
 * - Ollama embeddings with nomic-embed-text (768 dimensions)
 * - Automatic truncation and retry on context length errors
 * - Model-specific context limits
 * - Better error handling
 */

// Import from footnote (workspace package with dist built)
import {
  createEmbedder,
  type Embedder,
  type EmbedderConfig,
} from "@mieweb/footnote";

export type { EmbedderConfig };

const DEFAULT_MODEL = "ollama:nomic-embed-text";
const DEFAULT_DIMENSION = 768;

let cachedEmbedder: Embedder | null = null;

/**
 * Get or create the shared embedder instance.
 * Uses footnote's OllamaEmbedder which handles:
 * - Context length truncation and retries
 * - Model-specific limits
 * - Better error messages
 */
function getEmbedder(config?: Partial<EmbedderConfig>): Embedder {
  if (!cachedEmbedder) {
    cachedEmbedder = createEmbedder({
      model: config?.model ?? DEFAULT_MODEL,
      dimension: config?.dimension ?? DEFAULT_DIMENSION,
      baseUrl: config?.baseUrl,
    });
  }
  return cachedEmbedder;
}

/**
 * Reset the cached embedder (useful for tests).
 */
export function resetEmbedder(): void {
  cachedEmbedder = null;
}

/**
 * Generate an embedding for a text string using footnote's embedder.
 *
 * @param text - The text to embed
 * @param config - Optional configuration for model and base URL
 * @returns The embedding vector (768 dimensions for nomic-embed-text) or null on failure
 */
export async function getEmbedding(
  text: string,
  config?: Partial<EmbedderConfig>
): Promise<number[] | null> {
  try {
    const embedder = getEmbedder(config);
    const [embedding] = await embedder.embed([text]);
    return embedding ?? null;
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
 * @returns true if Ollama is available, false otherwise
 */
export async function isOllamaAvailable(baseUrl?: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const url = baseUrl ?? "http://localhost:11434";
    const response = await fetch(`${url}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    return response.ok;
  } catch {
    return false;
  }
}

// Re-export footnote embedder utilities for direct use if needed
export { createEmbedder };
