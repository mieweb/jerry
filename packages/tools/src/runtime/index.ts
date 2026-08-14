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
import { wrapToolsWithAsk } from "./wrap-ask.js";
import { createReadDriveTool } from "../integrations/drive.js";
import {
  createPostYoutubeTool,
  createFetchYoutubeTool,
  createFetchYoutubeTranscriptTool,
} from "../integrations/youtube.js";

export type { ToolContext, StoredActivityEvent, ToolEgress, ApprovalStore, IntegrationDeps } from "./types.js";
export { createSummarizeActivityTool } from "./summarize-activity.js";
export { createSearchMemoryTool } from "./search-memory.js";
export { createScheduleFollowupTool } from "./schedule-followup.js";
export { createReadFileTool, createListWatchedTool } from "./file-tools.js";
export { createIndexDocumentTool } from "./index-document.js";
export { getEmbedding, isOllamaAvailable } from "./embeddings.js";
export { wrapToolWithAsk, wrapToolsWithAsk, type WaitingForApprovalResult } from "./wrap-ask.js";
export { createReadDriveTool } from "../integrations/drive.js";
export {
  createPostYoutubeTool,
  createFetchYoutubeTool,
  createFetchYoutubeTranscriptTool,
} from "../integrations/youtube.js";

export interface CreateJerryToolsOptions {
  /** Optional MCP tools to merge (e.g. from footnote adapter) */
  mcpTools?: ToolSet;
  /** Whether to wrap tools with ask-disposition approval flow */
  wrapAsk?: boolean;
}

/**
 * Create all Jerry tools bound to a tool context.
 *
 * @param ctx - Tool context with bindings and control functions
 * @param options - Optional configuration including MCP tools
 * @returns A ToolSet ready to pass to the runtime
 */
export function createJerryTools(
  ctx: ToolContext,
  options?: CreateJerryToolsOptions
): ToolSet {
  const coreTools: ToolSet = {
    summarize_activity: createSummarizeActivityTool(ctx),
    search_memory: createSearchMemoryTool(ctx),
    schedule_followup: createScheduleFollowupTool(ctx),
    read_file: createReadFileTool(ctx),
    list_watched: createListWatchedTool(ctx),
    index_document: createIndexDocumentTool(ctx),
    read_drive: createReadDriveTool({
      getAccessToken: async () => {
        if (!ctx.integrations?.getGoogleAccessToken) {
          throw new Error("Google OAuth not configured");
        }
        return ctx.integrations.getGoogleAccessToken();
      },
      getAuthorizationUrl: ctx.integrations?.getGoogleAuthUrl,
    }),
    post_youtube: createPostYoutubeTool({
      getAccessToken: async () => {
        if (!ctx.integrations?.getGoogleAccessToken) {
          throw new Error("Google OAuth not configured");
        }
        return ctx.integrations.getGoogleAccessToken();
      },
      getAuthorizationUrl: ctx.integrations?.getGoogleAuthUrl,
      readVideoFile: ctx.integrations?.readVideoFile,
    }),
    fetch_youtube: createFetchYoutubeTool({
      getAccessToken: async () => {
        if (!ctx.integrations?.getGoogleAccessToken) {
          throw new Error("Google OAuth not configured");
        }
        return ctx.integrations.getGoogleAccessToken();
      },
      getAuthorizationUrl: ctx.integrations?.getGoogleAuthUrl,
    }),
    fetch_youtube_transcript: createFetchYoutubeTranscriptTool({
      getAccessToken: async () => {
        if (!ctx.integrations?.getGoogleAccessToken) {
          throw new Error("Google OAuth not configured");
        }
        return ctx.integrations.getGoogleAccessToken();
      },
      getAuthorizationUrl: ctx.integrations?.getGoogleAuthUrl,
    }),
  };

  // Merge MCP tools if provided (they take precedence for overlapping names)
  let tools: ToolSet = coreTools;
  if (options?.mcpTools) {
    tools = { ...coreTools, ...options.mcpTools };
  }

  // Wrap tools with ask-disposition approval flow if enabled
  if (options?.wrapAsk && ctx.dispositions && ctx.approvalStore) {
    tools = wrapToolsWithAsk(tools, ctx);
  }

  return tools;
}
