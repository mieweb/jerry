/**
 * Runtime tools for Jerry agent.
 *
 * These are AI SDK tool() wrappers around the pure functions,
 * designed to be injected into the agent runtime.
 */

import type { ToolSet } from "ai";
import type { ToolContext } from "./types.js";
import { createSummarizeActivityTool } from "./summarize-activity.js";
import { createSearchMemoryTool } from "./search-memory.js";
import { createScheduleFollowupTool } from "./schedule-followup.js";
import { createReadFileTool, createListWatchedTool } from "./file-tools.js";
import { createIndexDocumentTool } from "./index-document.js";

export type { ToolContext, StoredActivityEvent } from "./types.js";
export { createSummarizeActivityTool } from "./summarize-activity.js";
export { createSearchMemoryTool } from "./search-memory.js";
export { createScheduleFollowupTool } from "./schedule-followup.js";
export { createReadFileTool, createListWatchedTool } from "./file-tools.js";
export { createIndexDocumentTool } from "./index-document.js";
export { getEmbedding, isOllamaAvailable } from "./embeddings.js";

/**
 * Create all Jerry tools bound to a tool context.
 *
 * @param ctx - Tool context with bindings and control functions
 * @returns A ToolSet ready to pass to the runtime
 */
export function createJerryTools(ctx: ToolContext): ToolSet {
  return {
    summarize_activity: createSummarizeActivityTool(ctx),
    search_memory: createSearchMemoryTool(ctx),
    schedule_followup: createScheduleFollowupTool(ctx),
    read_file: createReadFileTool(ctx),
    list_watched: createListWatchedTool(ctx),
    index_document: createIndexDocumentTool(ctx),
  };
}
