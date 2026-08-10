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
  type IntegrationDeps,
} from "@mieweb/jerry-tools/runtime";
import {
  createFootnoteMcpTools,
  createMcpClient,
  type McpClient,
} from "@mieweb/jerry-tools/mcp";
import { isMcpAvailable, resolveMcpServers } from "./mcp-config.js";
import { createDbApprovalStore } from "./approval-store.js";
import {
  createGoogleOAuthClient,
  resolveUserId,
  type GoogleOAuthEnv,
} from "./google-oauth.js";
import type { OAuthClient } from "@mieweb/jerry-tools/integrations/oauth";

type JerryToolSet = ReturnType<typeof createJerryTools>;

let mcpToolsCache: JerryToolSet | undefined;
let mcpLoadPromise: Promise<JerryToolSet | undefined> | undefined;
let mcpLoadedForProfileKey: string | undefined;
/** Monotonic generation so stale loads cannot overwrite a newer cache. */
let mcpLoadGeneration = 0;

/**
 * Clients for the MCP servers currently connected, so reloadMcpTools() can shut
 * their child processes down instead of orphaning them.
 */
let activeMcpClients: McpClient[] = [];

/** Cached profile dispositions from the latest ensureMcpTools call. */
let cachedDispositions: Record<string, ToolEgress> | undefined;
/** Cached egress policy from the latest ensureMcpTools call. */
let cachedEgressPolicy: string | undefined;
/** Cached Google OAuth client from the latest ensureMcpTools call. */
let cachedGoogleOAuthClient: OAuthClient | undefined;

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
      activeMcpClients.push(client);
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
 * Environment bindings needed for tool setup.
 */
export interface ToolEnv extends GoogleOAuthEnv {
  DB?: ToolContext["db"];
}

/**
 * Ensure MCP tools are loaded for the given profile before a turn runs.
 * Also caches profile dispositions for the ask-egress flow and sets up
 * Google OAuth client if configured.
 * Safe to call from fetch and queue handlers; concurrent calls coalesce.
 */
export async function ensureMcpTools(
  profile?: PrivacyProfile,
  env?: ToolEnv
): Promise<JerryToolSet | undefined> {
  const resolved = mergeProfile(profile ?? {});
  const key = profileKey(resolved);

  // Always update disposition cache from latest profile
  cachedDispositions = resolved.tools as Record<string, ToolEgress> | undefined;
  cachedEgressPolicy = resolved.egress;

  // Set up Google OAuth client if env is provided and configured
  if (env?.DB) {
    cachedGoogleOAuthClient = createGoogleOAuthClient(env, env.DB);
  }

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

  // Build integration deps for Google OAuth if client is configured
  let integrations: IntegrationDeps | undefined;
  if (cachedGoogleOAuthClient) {
    const oauthClient = cachedGoogleOAuthClient;
    integrations = {
      getGoogleAccessToken: async () => {
        const userId = await resolveUserId(ctx.db, ctx.sessionId);
        return oauthClient.getValidAccessToken(userId);
      },
      getGoogleAuthUrl: (state?: string) => oauthClient.getAuthorizationUrl(state),
      readVideoFile: async (filePath: string) => {
        const { readFile } = await import("node:fs/promises");
        const bytes = new Uint8Array(await readFile(filePath));
        const ext = filePath.toLowerCase().split(".").pop() ?? "";
        const mimeTypes: Record<string, string> = {
          mp4: "video/mp4",
          mov: "video/quicktime",
          avi: "video/x-msvideo",
          wmv: "video/x-ms-wmv",
          flv: "video/x-flv",
          webm: "video/webm",
          mkv: "video/x-matroska",
          "3gp": "video/3gpp",
          m4v: "video/x-m4v",
        };
        return { bytes, mimeType: mimeTypes[ext] ?? "video/mp4", size: bytes.byteLength };
      },
    };
  }

  const enrichedCtx: ToolContext = {
    ...ctx,
    dispositions: cachedDispositions,
    approvalStore: shouldWrapAsk ? createDbApprovalStore(ctx.db) : undefined,
    integrations,
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
 * Drop cached MCP connections so the next ensureMcpTools() reconnects.
 * Leaves dispositions and the OAuth client intact.
 */
function resetMcpConnectionCache(): void {
  mcpToolsCache = undefined;
  mcpLoadPromise = undefined;
  mcpLoadedForProfileKey = undefined;
  mcpLoadGeneration++;
}

/**
 * Reset MCP cache (for tests).
 */
export function resetMcpToolsCache(): void {
  resetMcpConnectionCache();
  activeMcpClients = [];
  cachedDispositions = undefined;
  cachedEgressPolicy = undefined;
  cachedGoogleOAuthClient = undefined;
}

/**
 * Restart the MCP servers and reconnect.
 *
 * The footnote MCP child reads its manifest once at startup and keeps an open
 * sqlite handle, so an index rebuilt underneath it is not reliably visible. The
 * collector calls this after each successful build.
 */
export async function reloadMcpTools(
  profile?: PrivacyProfile,
  env?: ToolEnv
): Promise<JerryToolSet | undefined> {
  const clients = activeMcpClients;
  activeMcpClients = [];

  await Promise.all(
    clients.map((client) =>
      client.disconnect().catch((err: unknown) => {
        console.warn(`[mcp] Failed to disconnect client: ${err}`);
      })
    )
  );

  resetMcpConnectionCache();
  return ensureMcpTools(profile, env);
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

export interface ApprovedToolExecution {
  toolName: string;
  args: unknown;
  result: unknown;
}

/**
 * Execute the latest pending approval with its originally validated arguments.
 *
 * Approval resume must not rely on the model to recreate the tool call: smaller
 * local models may emit a JSON example or prose instead of an actual call. The
 * pending row is the source of truth for both tool name and arguments.
 */
export async function executePendingApproval(
  ctx: ToolContext
): Promise<ApprovedToolExecution | null> {
  const pending = await ctx.db
    .prepare(
      `SELECT id, tool_name, args_json FROM tool_approvals
       WHERE session_id = ? AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`
    )
    .bind(ctx.sessionId)
    .first<{ id: string; tool_name: string; args_json: string | null }>();

  if (!pending) return null;

  const args = pending.args_json ? JSON.parse(pending.args_json) : {};
  const now = new Date().toISOString();
  const granted = await ctx.db
    .prepare(
      `UPDATE tool_approvals SET status = 'granted', updated_at = ?
       WHERE id = ? AND status = 'pending'`
    )
    .bind(now, pending.id)
    .run();

  if ((granted.meta?.changes ?? 0) === 0) return null;

  const tools = createJerryToolsWithMcp(ctx);
  const selectedTool = tools[pending.tool_name];
  if (!selectedTool?.execute) {
    throw new Error(`Approved tool "${pending.tool_name}" is unavailable`);
  }

  const result = await selectedTool.execute(args, {
    toolCallId: `approved-${pending.id}`,
    messages: [],
  });

  return { toolName: pending.tool_name, args, result };
}

/**
 * Inject MCP tools into the cache (for unit tests).
 */
export function setMcpToolsCacheForTest(tools: JerryToolSet | undefined): void {
  mcpToolsCache = tools;
  mcpLoadedForProfileKey = tools ? "test" : undefined;
  mcpLoadPromise = undefined;
}
