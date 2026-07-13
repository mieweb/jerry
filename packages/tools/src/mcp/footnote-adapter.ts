/**
 * Footnote MCP adapter — maps footnote MCP tools to Jerry ToolSet shape.
 *
 * Footnote exposes tools via MCP (docidx mcp):
 * - search_hybrid: Combined vector + FTS search
 * - search_fts: Full-text search only
 * - search_literal: Exact string grep
 * - read_document: Fetch document by path
 *
 * This adapter wraps these into AI SDK tool() format for Jerry.
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { McpClient, McpCallResult } from "./client.js";

/**
 * Local models often pass numeric tool args as strings (e.g. limit: "10").
 * Coerce so Zod validation accepts both forms.
 */
const limitParam = z.coerce
  .number()
  .int()
  .min(1)
  .max(20)
  .optional()
  .default(5)
  .describe("Maximum number of results to return");

/**
 * Extract text content from MCP call result.
 */
function extractTextContent(result: McpCallResult): string {
  if (result.isError) {
    const errorText = result.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    return `Error: ${errorText || "Unknown MCP error"}`;
  }

  return result.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

/**
 * Parse search results from footnote MCP response.
 */
function parseSearchResults(
  text: string
): Array<{ path: string; score?: number; snippet?: string }> {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => ({
        path: item.path || item.id || "unknown",
        score: item.score,
        snippet: item.snippet || item.content?.slice(0, 200),
      }));
    }
    return [];
  } catch {
    return [{ path: "raw", snippet: text.slice(0, 500) }];
  }
}

/**
 * Create footnote MCP tools adapted to Jerry ToolSet format.
 *
 * @param mcpClient - Connected MCP client for footnote server
 * @returns ToolSet with footnote tools (search_hybrid, search_fts, etc.)
 */
export function createFootnoteMcpTools(mcpClient: McpClient): ToolSet {
  return {
    search_hybrid: tool({
      description:
        "Search the user's indexed documents using hybrid search (vector similarity + full-text). " +
        "Returns the most relevant documents combining semantic meaning and keyword matches. " +
        "Prefer this over basic search_memory when available for richer results.",
      parameters: z.object({
        query: z
          .string()
          .describe("The search query — can be a question or keywords"),
        limit: limitParam,
      }),
      execute: async ({ query, limit = 5 }) => {
        try {
          const result = await mcpClient.callTool("search_hybrid", {
            query,
            k: limit,
          });
          const text = extractTextContent(result);
          const results = parseSearchResults(text);

          return {
            source: "footnote-mcp",
            method: "hybrid",
            query,
            results,
            count: results.length,
          };
        } catch (error) {
          return {
            error: true,
            message: `Footnote hybrid search failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
            results: [],
          };
        }
      },
    }),

    search_fts: tool({
      description:
        "Full-text search using BM25 ranking. Good for finding documents with specific keywords or phrases.",
      parameters: z.object({
        query: z.string().describe("Keywords or phrase to search for"),
        limit: limitParam,
      }),
      execute: async ({ query, limit = 5 }) => {
        try {
          const result = await mcpClient.callTool("search_fts", {
            query,
            k: limit,
          });
          const text = extractTextContent(result);
          const results = parseSearchResults(text);

          return {
            source: "footnote-mcp",
            method: "fts",
            query,
            results,
            count: results.length,
          };
        } catch (error) {
          return {
            error: true,
            message: `Footnote FTS search failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
            results: [],
          };
        }
      },
    }),

    search_literal: tool({
      description:
        "Search for exact string matches (grep-like). Use when you need to find a specific phrase or code snippet.",
      parameters: z.object({
        pattern: z.string().describe("Exact string or pattern to search for"),
        limit: limitParam,
      }),
      execute: async ({ pattern, limit = 5 }) => {
        try {
          const result = await mcpClient.callTool("search_literal", {
            query: pattern,
            k: limit,
          });
          const text = extractTextContent(result);
          const results = parseSearchResults(text);

          return {
            source: "footnote-mcp",
            method: "literal",
            pattern,
            results,
            count: results.length,
          };
        } catch (error) {
          return {
            error: true,
            message: `Footnote literal search failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
            results: [],
          };
        }
      },
    }),

    read_document: tool({
      description:
        "Fetch the full content of a document by its path. Use after search to get complete document text.",
      parameters: z.object({
        path: z.string().describe("Document path from search results"),
      }),
      execute: async ({ path }) => {
        try {
          const result = await mcpClient.callTool("read_document", {
            doc_id: path,
          });
          const text = extractTextContent(result);

          return {
            source: "footnote-mcp",
            path,
            content: text,
            length: text.length,
          };
        } catch (error) {
          return {
            error: true,
            message: `Failed to read document: ${
              error instanceof Error ? error.message : String(error)
            }`,
            path,
          };
        }
      },
    }),
  };
}

/**
 * Get the list of footnote tool names for agent instructions.
 */
export const FOOTNOTE_TOOL_NAMES = [
  "search_hybrid",
  "search_fts",
  "search_literal",
  "read_document",
] as const;
