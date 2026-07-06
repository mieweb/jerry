/**
 * File tools — read files from bucket and list watched files.
 */

import { tool } from "ai";
import { z } from "zod";
import type { ToolContext, StoredActivityEvent } from "./types.js";

/**
 * Create the read_file tool.
 * Reads file content from the bucket storage.
 */
export function createReadFileTool(ctx: ToolContext) {
  return tool({
    description:
      "Read the contents of a file from storage. Use this to retrieve documents, " +
      "notes, or other files that have been indexed. Provide the file path as stored.",
    parameters: z.object({
      path: z.string().describe("The path/key of the file to read from storage"),
    }),
    execute: async ({ path }) => {
      if (!ctx.bucket) {
        return {
          error: true,
          message: "File storage is not available. The bucket may not be configured.",
          content: null,
        };
      }

      try {
        const object = await ctx.bucket.get(path);

        if (!object) {
          return {
            error: true,
            message: `File not found: ${path}`,
            content: null,
          };
        }

        const content = await object.text();

        return {
          error: false,
          path,
          size: object.size,
          content,
        };
      } catch (err) {
        return {
          error: true,
          message: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
          content: null,
        };
      }
    },
  });
}

interface WatchedFileInfo {
  path: string;
  name: string;
  extension: string;
  size: number;
  lastSeen: string;
}

/**
 * Create the list_watched tool.
 * Lists files that have been captured by the folder watcher.
 */
export function createListWatchedTool(ctx: ToolContext) {
  return tool({
    description:
      "List files that have been captured by the folder watcher (screenshots, notes, documents). " +
      "Use this to see what files are available for searching or reading.",
    parameters: z.object({
      prefix: z
        .string()
        .optional()
        .describe("Optional path prefix to filter files (e.g., '/Users/me/Screenshots')"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Maximum number of files to return"),
    }),
    execute: async ({ prefix, limit = 20 }) => {
      try {
        // Query activity_events for folder-watcher and screenshot sources
        let query = `
          SELECT DISTINCT payload, occurred_at
          FROM activity_events
          WHERE source IN ('folder', 'screenshot', 'folder-watcher')
          ORDER BY occurred_at DESC
          LIMIT ?
        `;
        const params: unknown[] = [limit * 2]; // Fetch extra for deduplication

        if (prefix) {
          query = `
            SELECT DISTINCT payload, occurred_at
            FROM activity_events
            WHERE source IN ('folder', 'screenshot', 'folder-watcher')
              AND json_extract(payload, '$.path') LIKE ?
            ORDER BY occurred_at DESC
            LIMIT ?
          `;
          params.unshift(`${prefix}%`);
        }

        const result = await ctx.db.prepare(query).bind(...params).all<{
          payload: string;
          occurred_at: string;
        }>();

        if (!result.results || result.results.length === 0) {
          return {
            error: false,
            message: "No watched files found.",
            files: [],
          };
        }

        // Parse and deduplicate by path
        const seenPaths = new Set<string>();
        const files: WatchedFileInfo[] = [];

        for (const row of result.results) {
          if (files.length >= limit) break;

          try {
            const payload =
              typeof row.payload === "string"
                ? JSON.parse(row.payload)
                : row.payload;

            const path = payload.path as string;
            if (!path || seenPaths.has(path)) continue;
            seenPaths.add(path);

            files.push({
              path,
              name: payload.name ?? path.split("/").pop() ?? "",
              extension: payload.extension ?? "",
              size: payload.size ?? 0,
              lastSeen: row.occurred_at,
            });
          } catch {
            // Skip malformed payloads
          }
        }

        return {
          error: false,
          count: files.length,
          files,
        };
      } catch (err) {
        return {
          error: true,
          message: `Failed to list files: ${err instanceof Error ? err.message : String(err)}`,
          files: [],
        };
      }
    },
  });
}
