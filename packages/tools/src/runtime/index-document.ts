/**
 * index_document tool — index a document into the vector store.
 *
 * Generates embeddings via Ollama and stores in CloudVectorIndex.
 * Also stores raw content in CloudBucket for later retrieval.
 */

import { tool } from "ai";
import { z } from "zod";
import type { ToolContext } from "./types.js";
import { getEmbedding } from "./embeddings.js";

/**
 * Generate a stable ID for a document based on its path.
 */
function generateDocumentId(path: string): string {
  // Use a simple hash of the path for consistent IDs
  let hash = 0;
  for (let i = 0; i < path.length; i++) {
    const char = path.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `doc_${Math.abs(hash).toString(36)}`;
}

/**
 * Create the index_document tool.
 * Indexes document content into the vector store for semantic search.
 */
export function createIndexDocumentTool(ctx: ToolContext) {
  return tool({
    description:
      "Index a document into the semantic search system. Use this to add new content " +
      "that can later be found with search_memory. The document will be embedded and stored.",
    parameters: z.object({
      path: z.string().describe("The path/key to store the document under"),
      content: z.string().describe("The text content of the document to index"),
      metadata: z
        .record(z.string())
        .optional()
        .describe("Optional metadata (title, source, tags, etc.)"),
    }),
    execute: async ({ path, content, metadata = {} }) => {
      if (!ctx.vectors) {
        return {
          error: true,
          message: "Vector index is not available. Cannot index document.",
          indexed: false,
        };
      }

      try {
        // Generate embedding for the content
        const embedding = await getEmbedding(content);

        if (!embedding) {
          return {
            error: true,
            message:
              "Could not generate embedding. Ollama may not be running or nomic-embed-text model may not be available.",
            indexed: false,
          };
        }

        const id = generateDocumentId(path);

        // Prepare metadata with standard fields
        const vectorMetadata: Record<string, string> = {
          ...metadata,
          path,
          title: metadata.title ?? path.split("/").pop() ?? "Untitled",
          snippet: content.slice(0, 500),
          source: metadata.source ?? "indexed",
          indexedAt: new Date().toISOString(),
        };

        // Upsert into vector index
        await ctx.vectors.upsert([
          {
            id,
            values: embedding,
            metadata: vectorMetadata,
          },
        ]);

        // Also store raw content in bucket for read_file retrieval
        if (ctx.bucket) {
          await ctx.bucket.put(path, content, {
            httpMetadata: { contentType: "text/plain" },
            customMetadata: vectorMetadata,
          });
        }

        return {
          error: false,
          indexed: true,
          id,
          path,
          embeddingDimensions: embedding.length,
        };
      } catch (err) {
        return {
          error: true,
          message: `Failed to index document: ${err instanceof Error ? err.message : String(err)}`,
          indexed: false,
        };
      }
    },
  });
}
