/**
 * Local tools module for jerry-term.
 *
 * Provides tools that work in standalone CLI mode without Cloudflare bindings.
 * summarize_activity uses direct ActivityWatch HTTP calls.
 * Other tools are stubbed with helpful messages.
 */

import type { ToolSet } from "ai";
import type { LocalToolContext } from "./types.ts";
import { createLocalToolContext } from "./types.ts";
import { createLocalSummarizeActivityTool } from "./summarize-activity.ts";
import {
  createStubSearchMemory,
  createStubScheduleFollowup,
  createStubReadFile,
  createStubListWatched,
  createStubIndexDocument,
} from "./stubs.ts";

export type { LocalToolContext } from "./types.ts";
export { createLocalToolContext, DEFAULT_AW_URL } from "./types.ts";
export { createLocalSummarizeActivityTool } from "./summarize-activity.ts";
export {
  createStubSearchMemory,
  createStubScheduleFollowup,
  createStubReadFile,
  createStubListWatched,
  createStubIndexDocument,
} from "./stubs.ts";

/**
 * Create local tools for jerry-term REPL.
 *
 * @param options - Optional context overrides (awUrl, fetchFn)
 * @returns ToolSet ready to pass to the runtime
 */
export function createLocalTools(
  options?: Partial<LocalToolContext>
): ToolSet {
  const ctx = createLocalToolContext(options);

  return {
    summarize_activity: createLocalSummarizeActivityTool(ctx),
    search_memory: createStubSearchMemory(),
    schedule_followup: createStubScheduleFollowup(),
    read_file: createStubReadFile(),
    list_watched: createStubListWatched(),
    index_document: createStubIndexDocument(),
  };
}
