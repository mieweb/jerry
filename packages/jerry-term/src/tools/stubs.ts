/**
 * Stub tools for features not available in local jerry-term mode.
 *
 * These return helpful messages explaining why the feature isn't available
 * and how to access it via the full Jerry worker.
 */

import { tool } from "ai";
import { z } from "zod";

export function createStubSearchMemory() {
  return tool({
    description:
      "Search semantic memory for relevant documents and past conversations.",
    parameters: z.object({
      query: z.string().describe("Search query"),
    }),
    execute: async ({ query }) => {
      return (
        `Memory search for "${query}" is not available in local mode. ` +
        "This feature requires the Jerry worker with vector embeddings.\n\n" +
        "Options:\n" +
        "- Use `/runtime ozwell` to switch to Ozwell cloud runtime\n" +
        "- Run the full Jerry worker (`pnpm dev` in jerry-app)\n" +
        "- Use the `jerry` CLI which connects to the worker"
      );
    },
  });
}

export function createStubScheduleFollowup() {
  return tool({
    description: "Schedule a follow-up reminder for a future time.",
    parameters: z.object({
      message: z.string().describe("Reminder message"),
      when: z.string().describe("When to remind (e.g., 'in 2 hours', 'tomorrow at 9am')"),
    }),
    execute: async ({ message, when }) => {
      return (
        `Scheduling reminder "${message}" for ${when} is not available in local mode. ` +
        "This feature requires the Jerry worker with Durable Objects.\n\n" +
        "Options:\n" +
        "- Use `/runtime ozwell` to switch to Ozwell cloud runtime\n" +
        "- Run the full Jerry worker for scheduling support"
      );
    },
  });
}

export function createStubReadFile() {
  return tool({
    description: "Read a file from the watched folders.",
    parameters: z.object({
      path: z.string().describe("File path to read"),
    }),
    execute: async ({ path }) => {
      return (
        `Cannot read file "${path}" - file storage is not available in local mode. ` +
        "This feature requires the Jerry worker with R2 bucket storage.\n\n" +
        "For local file access, you can read files directly from the filesystem."
      );
    },
  });
}

export function createStubListWatched() {
  return tool({
    description: "List files in watched folders.",
    parameters: z.object({
      folder: z.string().optional().describe("Folder to list (optional)"),
    }),
    execute: async () => {
      return (
        "File listing is not available in local mode. " +
        "This feature requires the Jerry worker with folder watching.\n\n" +
        "For local file listing, you can use standard shell commands."
      );
    },
  });
}

export function createStubIndexDocument() {
  return tool({
    description: "Index a document for semantic search.",
    parameters: z.object({
      content: z.string().describe("Document content to index"),
      metadata: z.record(z.string()).optional().describe("Optional metadata"),
    }),
    execute: async () => {
      return (
        "Document indexing is not available in local mode. " +
        "This feature requires the Jerry worker with vector embeddings.\n\n" +
        "Options:\n" +
        "- Use `/runtime ozwell` for cloud-based indexing\n" +
        "- Run the full Jerry worker with Vectorize support"
      );
    },
  });
}
