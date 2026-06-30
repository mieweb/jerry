/**
 * search_memory tool — semantic search over indexed documents.
 *
 * Uses the CloudVectorIndex binding (footnote) for semantic + literal search.
 */

import { tool } from "ai";
import { z } from "zod";
import type { ToolContext } from "./types.js";

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
        .default(5)
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
        // Query the vector index
        // Note: This assumes the vector index has been populated with embeddings
        // In a real implementation, we would need to embed the query first
        const queryVector = await getQueryEmbedding(query);

        if (!queryVector) {
          return {
            error: true,
            message: "Could not generate embedding for query.",
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

/**
 * Generate an embedding for a query string.
 * This is a placeholder — in production this would call an embedding model.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function getQueryEmbedding(_query: string): Promise<number[] | null> {
  // Placeholder: return a random vector for now
  // In production, this would call Ollama, OpenAI, or Workers AI for embeddings
  // The dimension should match the index configuration (768 for many models)
  const dim = 768;
  const vector = new Array(dim).fill(0).map(() => Math.random() * 2 - 1);

  // Normalize the vector
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  return vector.map((v) => v / magnitude);
}
