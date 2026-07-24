/**
 * Jerry tool factory with optional MCP providers (footnote hybrid search).
 *
 * Loads MCP tools before agent turns when stdio spawning is available.
 * Falls back to in-process search_memory when MCP is disabled or unavailable.
 *
 * Worker/CLI flow:
 * 1. ensureMcpTools(profile) — spawn footnote MCP child, cache adapted tools
 * 2. createJerryToolsWithMcp(ctx) — merge cached MCP tools into the turn ToolSet
 */

import { mergeProfile, type PrivacyProfile } from "@mieweb/jerry-agent-runtime";
import {
  createJerryTools,
  type ToolContext,
  type ToolEgress,
} from "@mieweb/jerry-tools/runtime";
import {
  createFootnoteMcpTools,
  createMcpClient,
} from "@mieweb/jerry-tools/mcp";
import { isMcpAvailable, resolveMcpServers } from "./mcp-config.js";
import { createDbApprovalStore } from "./approval-store.js";

type JerryToolSet = ReturnType<typeof createJerryTools>;

let mcpToolsCache: JerryToolSet | undefined;
let mcpLoadPromise: Promise<JerryToolSet | undefined> | undefined;
let mcpLoadedForProfileKey: string | undefined;
/** Monotonic generation so stale loads cannot overwrite a newer cache. */
let mcpLoadGeneration = 0;

/** Cached profile dispositions from the latest ensureMcpTools call. */
let cachedDispositions: Record<string, ToolEgress> | undefined;
/** Cached egress policy from the latest ensureMcpTools call. */
let cachedEgressPolicy: string | undefined;

function profileKey(profile?: PrivacyProfile): string {
  return JSON.stringify(profile?.mcp?.servers ?? "default");
}

/**
 * Connect to configured MCP servers and build merged tool sets.
 * Returns undefined when MCP is unavailable or every server fails to connect
 * (caller keeps in-process search_memory).
 */
export async function loadMcpTools(
  profile?: PrivacyProfile
): Promise<JerryToolSet | undefined> {
  if (!isMcpAvailable()) {
    return undefined;
  }

  const merged: JerryToolSet = {};
  const servers = resolveMcpServers(profile);

  for (const config of servers) {
    const client = await createMcpClient(config);
    if (!client) {
      console.warn(
        `[mcp] Server "${config.name}" unavailable — using in-process tools only`
      );
      continue;
    }

    if (config.name === "footnote") {
      Object.assign(merged, createFootnoteMcpTools(client));
      console.warn(`[mcp] Footnote tools loaded via stdio`);
    } else {
      console.warn(
        `[mcp] Connected to "${config.name}" but no adapter is registered yet`
      );
      await client.disconnect();
    }
  }

  return Object.keys(merged).length > 0 ? merged : undefined;
}

/**
 * Ensure MCP tools are loaded for the given profile before a turn runs.
 * Also caches profile dispositions for the ask-egress flow.
 * Safe to call from fetch and queue handlers; concurrent calls coalesce.
 */
export async function ensureMcpTools(
  profile?: PrivacyProfile
): Promise<JerryToolSet | undefined> {
  const resolved = mergeProfile(profile ?? {});
  const key = profileKey(resolved);

  // Always update disposition cache from latest profile
  cachedDispositions = resolved.tools as Record<string, ToolEgress> | undefined;
  cachedEgressPolicy = resolved.egress;

  if (mcpToolsCache && mcpLoadedForProfileKey === key) {
    return mcpToolsCache;
  }

  if (mcpLoadPromise && mcpLoadedForProfileKey === key) {
    return mcpLoadPromise;
  }

  const generation = ++mcpLoadGeneration;
  mcpLoadedForProfileKey = key;
  mcpToolsCache = undefined;
  mcpLoadPromise = loadMcpTools(resolved).then((tools) => {
    if (generation === mcpLoadGeneration) {
      mcpToolsCache = tools;
    }
    return tools;
  });

  return mcpLoadPromise;
}

/**
 * Create Jerry tools for a turn, merging MCP tools when available.
 * When footnote hybrid search is loaded, search_memory is omitted so the
 * agent uses search_hybrid for document queries.
 *
 * When egress is "allow-tools", tools with "ask" disposition are wrapped
 * with approval flow.
 *
 * Requires ensureMcpTools() to have completed for this process first.
 */
export function createJerryToolsWithMcp(ctx: ToolContext): JerryToolSet {
  // Enrich context with dispositions and approval store for ask-egress flow
  const shouldWrapAsk = cachedEgressPolicy === "allow-tools" && !!cachedDispositions;
  const enrichedCtx: ToolContext = {
    ...ctx,
    dispositions: cachedDispositions,
    approvalStore: shouldWrapAsk ? createDbApprovalStore(ctx.db) : undefined,
  };

  const tools = createJerryTools(enrichedCtx, {
    mcpTools: mcpToolsCache,
    wrapAsk: shouldWrapAsk,
  });

  if (mcpToolsCache?.search_hybrid) {
    const result = { ...tools };
    delete result.search_memory;
    return result;
  }

  return tools;
}

/**
 * Reset MCP cache (for tests).
 */
export function resetMcpToolsCache(): void {
  mcpToolsCache = undefined;
  mcpLoadPromise = undefined;
  mcpLoadedForProfileKey = undefined;
  mcpLoadGeneration++;
  cachedDispositions = undefined;
  cachedEgressPolicy = undefined;
}

/**
 * Grant a pending tool approval (for resume flow).
 * Called when a session resumes from waiting_for_approval status.
 */
export async function grantPendingApproval(
  ctx: ToolContext,
  toolName: string
): Promise<boolean> {
  const store = createDbApprovalStore(ctx.db);
  return store.grantPending(ctx.sessionId, toolName);
}

/**
 * Get the pending tool name for a session (for resume flow).
 */
export async function getPendingToolName(
  ctx: ToolContext
): Promise<string | null> {
  const result = await ctx.db
    .prepare(
      `SELECT tool_name FROM tool_approvals
       WHERE session_id = ? AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`
    )
    .bind(ctx.sessionId)
    .first<{ tool_name: string }>();

  return result?.tool_name ?? null;
}

/**
 * Inject MCP tools into the cache (for unit tests).
 */
export function setMcpToolsCacheForTest(tools: JerryToolSet | undefined): void {
  mcpToolsCache = tools;
  mcpLoadedForProfileKey = tools ? "test" : undefined;
  mcpLoadPromise = undefined;
}
