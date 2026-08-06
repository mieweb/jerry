/**
 * search_memory tool — semantic search over indexed documents.
 *
 * Uses the CloudVectorIndex binding (footnote) for semantic + literal search.
 * Embeddings are generated via Ollama's nomic-embed-text model.
 */

import { tool } from "ai";
import { z } from "zod";
import type { ToolContext } from "./types.js";
import { getEmbedding } from "./embeddings.js";

interface VectorMatch {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

interface VectorQueryResult {
  matches?: VectorMatch[];
}

/**
 * Create the search_memory tool.
 */
export function createSearchMemoryTool(ctx: ToolContext) {
  return tool({
    description:
      "Search the user's indexed documents, notes, and screenshots for relevant information. " +
      "Performs semantic search to find content by meaning, not just exact matches. " +
      "Use this when the user asks about something they saw, wrote, or captured earlier.",
    parameters: z.object({
      query: z
        .string()
        .describe("What to search for — describe the content you're looking for"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .nullable()
        .optional()
        .default(5)
        .transform((v) => v ?? 5)
        .describe("Maximum number of results to return"),
    }),
    execute: async ({ query, limit = 5 }) => {
      if (!ctx.vectors) {
        return {
          error: true,
          message:
            "Vector search is not available. The footnote index may not be configured.",
          results: [],
        };
      }

      try {
        // Generate embedding for the search query using Ollama
        const queryVector = await getEmbedding(query);

        if (!queryVector) {
          return {
            error: true,
            message:
              "Could not generate embedding for query. Ollama may not be running or nomic-embed-text model may not be available.",
            results: [],
          };
        }

        const response = (await ctx.vectors.query(queryVector, {
          topK: limit,
          returnMetadata: "all",
        })) as VectorQueryResult;

        const results = (response.matches ?? []).map((match: VectorMatch) => ({
          id: match.id,
          score: match.score,
          metadata: match.metadata,
        }));

        if (results.length === 0) {
          return {
            error: false,
            message: `No results found for: "${query}"`,
            results: [],
          };
        }

        return {
          error: false,
          query,
          resultCount: results.length,
          results: results.map((r) => ({
            id: r.id,
            score: r.score,
            title: r.metadata?.title ?? "Untitled",
            snippet: r.metadata?.snippet ?? "",
            source: r.metadata?.source ?? "unknown",
          })),
        };
      } catch (err) {
        return {
          error: true,
          message: `Search failed: ${err instanceof Error ? err.message : String(err)}`,
          results: [],
        };
      }
    },
  });
}
