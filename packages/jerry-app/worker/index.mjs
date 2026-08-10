/**
 * Jerry worker — `export default { fetch, queue, scheduled }`.
 * The same module runs unchanged on every target:
 *
 *   cloudflare : `mieweb dev` (wrangler / Miniflare) with native bindings
 *   local      : `mieweb --target local dev` (SQLite + in-memory KV)
 *   mieweb/os  : `mieweb --target mieweb dev` (libSQL + Valkey)
 *
 * @typedef {import('@mieweb/cloud-agent').HostEnv} Env
 */

import {
  hostAgent,
  insertEvent,
  insertMessage,
  updateSessionStatus,
} from "@mieweb/cloud-agent";
import { resolveRuntime, mergeProfile } from "@mieweb/jerry-agent-runtime";
import { getEmbedding } from "@mieweb/jerry-tools/runtime";
import { jerry } from "../src/agent.ts";
import {
  createJerryToolsWithMcp,
  ensureMcpTools,
  executePendingApproval,
  reloadMcpTools,
} from "../src/create-tools.ts";
import {
  createGoogleOAuthClient,
  buildGoogleOAuthConfig,
} from "../src/google-oauth.ts";

/**
 * Turn a verified tool result into readable text without giving the model
 * another opportunity to call tools. Raw JSON remains the fallback.
 *
 * @param {unknown} profile
 * @param {{ toolName: string, result: unknown }} execution
 */
async function formatApprovedToolResult(profile, execution) {
  const rawResult = JSON.stringify(execution.result, null, 2);
  const runtime = resolveRuntime(mergeProfile(profile));
  let formatted = "";

  try {
    for await (const event of runtime.runTurn({
      system:
        "Format the supplied tool result for the user. Use only facts present " +
        "in the JSON. Preserve exact IDs, titles, privacy statuses, dates, and URLs. " +
        "Never invent, infer, rename, or omit returned items. If the result is an " +
        "error, explain that error concisely. Do not mention function calls or approval.",
      messages: [
        {
          role: "user",
          content:
            `Tool: ${execution.toolName}\n` +
            `Verified result JSON:\n${rawResult}`,
        },
      ],
      maxSteps: 1,
    })) {
      if (event.type === "text-delta") formatted += event.text;
    }
  } catch {
    // The exact JSON is safer than failing an already-executed approved tool.
  }

  return formatted.trim() || `Executed "${execution.toolName}".\n\n${rawResult}`;
}

/**
 * Preload MCP tools before agent turns that need external search.
 * Approval resumes execute the stored, validated tool call directly. Starting
 * another model turn here is unsafe: a weak local model may emit prose or fake
 * JSON instead of calling the approved tool again.
 *
 * @param {Request} request
 * @param {URL} url
 * @param {Env} env
 */
async function prepareMcpForRequest(request, url, env) {
  if (request.method !== "POST") return;
  if (
    !url.pathname.includes("/v1/sessions/") ||
    (!url.pathname.endsWith("/messages") && !url.pathname.endsWith("/enqueue"))
  ) {
    return;
  }

  // Extract session ID from URL: /v1/sessions/:id/messages
  const sessionMatch = url.pathname.match(/\/v1\/sessions\/([^/]+)\//);
  const sessionId = sessionMatch?.[1];

  const body = await request.clone().json().catch(() => ({}));
  await ensureMcpTools(body.profile, env);

  if (
    !sessionId ||
    !env.DB ||
    !url.pathname.endsWith("/messages")
  ) {
    return;
  }

  const session = await env.DB
    .prepare("SELECT status FROM sessions WHERE id = ?")
    .bind(sessionId)
    .first();

  if (session?.status !== "waiting_for_approval") return;

  const ctx = {
    sessionId,
    db: env.DB,
    vectors: env.VECTORS,
    bucket: env.BUCKET,
    scheduleWake: async () => {},
    suspendForUser: () => {},
    suspendForApproval: () => {},
  };

  await insertMessage(env.DB, sessionId, "user", body.message ?? "approved");
  await insertEvent(env.DB, sessionId, "user_message", {
    message: body.message ?? "approved",
  });
  await insertEvent(env.DB, sessionId, "resumed");
  await updateSessionStatus(env.DB, sessionId, "running");

  try {
    const execution = await executePendingApproval(ctx);
    if (!execution) {
      await updateSessionStatus(env.DB, sessionId, "idle");
      return json(
        { error: "No pending approved tool call was found", sessionId },
        409
      );
    }

    const message = await formatApprovedToolResult(body.profile, execution);

    await insertMessage(env.DB, sessionId, "assistant", message);
    await insertEvent(env.DB, sessionId, "agent_message", {
      content: message,
      finishReason: "tool-result",
      toolName: execution.toolName,
      toolResult: execution.result,
    });
    await updateSessionStatus(env.DB, sessionId, "idle");

    return json({
      ok: true,
      sessionId,
      status: "idle",
      message,
      finishReason: "tool-result",
      toolName: execution.toolName,
      toolResult: execution.result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await insertEvent(env.DB, sessionId, "error", { message });
    await updateSessionStatus(env.DB, sessionId, "idle");
    return json({ error: message, sessionId }, 500);
  }
}

/**
 * Replace model-authored approval chatter with the authoritative pending call.
 * The model may continue generating after the ask wrapper parks the session;
 * neither that prose nor claims such as "simulated response" belong in the
 * approval prompt or future conversation history.
 *
 * @param {Response} response
 * @param {string | undefined} sessionId
 * @param {Env} env
 */
async function normalizeApprovalResponse(response, sessionId, env) {
  if (!sessionId || !env.DB || !response.headers.get("content-type")?.includes("application/json")) {
    return response;
  }

  const payload = await response.clone().json().catch(() => null);
  if (payload?.status !== "waiting_for_approval") return response;

  const pending = await env.DB
    .prepare(
      `SELECT tool_name, args_json FROM tool_approvals
       WHERE session_id = ? AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`
    )
    .bind(sessionId)
    .first();

  if (!pending) return response;

  const args = pending.args_json ? JSON.parse(pending.args_json) : {};
  const message =
    `Tool "${pending.tool_name}" requires approval.\n\n` +
    `Arguments:\n${JSON.stringify(args, null, 2)}\n\n` +
    "Reply to approve and execute this exact call.";

  await env.DB
    .prepare(
      `UPDATE messages SET content = ?
       WHERE id = (
         SELECT id FROM messages
         WHERE session_id = ? AND role = 'assistant'
         ORDER BY created_at DESC LIMIT 1
       )`
    )
    .bind(JSON.stringify(message), sessionId)
    .run();

  return json({ ...payload, message }, response.status);
}

/**
 * Create the host wiring for Jerry.
 * This is called once at module load time.
 */
const host = hostAgent({
  agent: jerry,
  createRuntime: (profile) => {
    return resolveRuntime(mergeProfile(profile));
  },
  createTools: createJerryToolsWithMcp,
  store: {
    // Store bindings are resolved from env at request time
    // This is a placeholder; actual db/vectors come from env
    db: null,
  },
});

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });

/**
 * Export the AgentSession Durable Object class.
 * This must be exported for the DO binding to work.
 */
export const AgentSession = host.SessionClass;

export default {
  /**
   * Fetch handler: routes requests to the agent session DO.
   * @param {Request} request
   * @param {Env} env
   * @param {ExecutionContext} ctx
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Health check (doesn't need DO)
    if (url.pathname === "/" || url.pathname === "/health") {
      return json({
        ok: true,
        agent: "jerry",
        package: "@mieweb/jerry-app",
        status: "ok",
      });
    }

    // Legacy /hits demo (Phase 0) - keep for backward compatibility
    if (url.pathname === "/hits") {
      await env.DB.prepare(
        "CREATE TABLE IF NOT EXISTS hits (id INTEGER PRIMARY KEY, at TEXT)"
      ).run();
      await env.DB.prepare("INSERT INTO hits (at) VALUES (?)")
        .bind(new Date().toISOString())
        .run();
      const { results } = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM hits"
      ).all();
      const n = results?.[0]?.n ?? 0;
      await env.CACHE.put("last-count", String(n));
      return json({ hits: n });
    }

    // PUT /v1/files/:path — store file content in bucket (collector ingest pipeline)
    const fileMatch = url.pathname.match(/^\/v1\/files\/(.+)$/);
    if (fileMatch && request.method === "PUT") {
      if (!env.BUCKET) {
        return json({ error: "Bucket binding not available" }, 503);
      }
      const filePath = decodeURIComponent(fileMatch[1]);
      const content = await request.text();
      await env.BUCKET.put(filePath, content, {
        httpMetadata: {
          contentType: request.headers.get("Content-Type") ?? "text/plain",
        },
      });
      return json({ ok: true, path: filePath, size: content.length });
    }

    // POST /v1/index — embed and upsert a document (collector ingest pipeline)
    if (url.pathname === "/v1/index" && request.method === "POST") {
      if (!env.VECTORS) {
        return json({ error: "Vector index binding not available" }, 503);
      }
      const body = await request.json();
      const { path, content, metadata = {} } = body;

      if (!path || !content) {
        return json({ error: "path and content are required" }, 400);
      }

      const embedding = await getEmbedding(content);
      if (!embedding) {
        return json(
          {
            error:
              "Failed to generate embedding. Is Ollama running with nomic-embed-text?",
          },
          503
        );
      }

      // Derive a stable ID from the path (mirrors index-document.ts logic)
      let hash = 0;
      for (let i = 0; i < path.length; i++) {
        const char = path.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
      }
      const docId = `doc_${Math.abs(hash).toString(36)}`;

      const vectorMetadata = {
        ...metadata,
        path,
        title: metadata.title ?? path.split("/").pop() ?? "Untitled",
        snippet: content.slice(0, 500),
        source: metadata.source ?? "indexed",
        indexedAt: new Date().toISOString(),
      };

      await env.VECTORS.upsert([
        { id: docId, values: embedding, metadata: vectorMetadata },
      ]);

      if (env.BUCKET) {
        await env.BUCKET.put(path, content, {
          httpMetadata: { contentType: "text/plain" },
          customMetadata: vectorMetadata,
        });
      }

      return json({ ok: true, id: docId, path, embeddingDimensions: embedding.length });
    }

    // POST /v1/mcp/reload — respawn MCP servers after the collector rebuilds
    // the footnote index (the running server holds a stale sqlite handle)
    if (url.pathname === "/v1/mcp/reload" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      try {
        const tools = await reloadMcpTools(body.profile, env);
        return json({ ok: true, tools: tools ? Object.keys(tools) : [] });
      } catch (err) {
        return json(
          { error: err instanceof Error ? err.message : String(err) },
          500
        );
      }
    }

    // POST /v1/mcp — expose Jerry tools over the MCP Streamable HTTP transport
    if (url.pathname === "/v1/mcp") {
      try {
        const { handleMcpRequest } = await import("../src/mcp-handler.ts");
        return await handleMcpRequest(request, env);
      } catch (err) {
        console.error("MCP endpoint error:", err);
        return json(
          { error: err instanceof Error ? err.message : String(err) },
          500
        );
      }
    }

    // GET /v1/oauth/google/start — redirect user to Google OAuth consent
    if (url.pathname === "/v1/oauth/google/start" && request.method === "GET") {
      const config = buildGoogleOAuthConfig(env);
      if (!config) {
        return json({ error: "Google OAuth not configured" }, 503);
      }

      const userId = url.searchParams.get("userId") ?? "local";
      const state = JSON.stringify({ userId });

      const params = new URLSearchParams({
        response_type: "code",
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        scope: config.scopes.join(" "),
        access_type: "offline",
        prompt: "consent",
        state,
      });

      const authUrl = `${config.authUrl}?${params.toString()}`;
      return Response.redirect(authUrl, 302);
    }

    // GET /v1/oauth/google/callback — exchange code for tokens
    if (url.pathname === "/v1/oauth/google/callback" && request.method === "GET") {
      const code = url.searchParams.get("code");
      const stateParam = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        return new Response(
          `<html><body><h1>Authorization failed</h1><p>${error}</p></body></html>`,
          { status: 400, headers: { "content-type": "text/html" } }
        );
      }

      if (!code) {
        return json({ error: "Missing authorization code" }, 400);
      }

      let userId = "local";
      if (stateParam) {
        try {
          const parsed = JSON.parse(stateParam);
          userId = parsed.userId ?? "local";
        } catch {
          // Use default userId
        }
      }

      const client = createGoogleOAuthClient(env, env.DB);
      if (!client) {
        return json({ error: "Google OAuth not configured" }, 503);
      }

      try {
        await client.exchangeAuthorizationCode(userId, code);
        return new Response(
          `<html><body>
            <h1>Google account connected</h1>
            <p>Drive and YouTube access enabled. You can close this window and return to Jerry.</p>
          </body></html>`,
          { status: 200, headers: { "content-type": "text/html" } }
        );
      } catch (err) {
        console.error("OAuth callback error:", err);
        return new Response(
          `<html><body><h1>Authorization failed</h1><p>Could not exchange code for tokens.</p></body></html>`,
          { status: 500, headers: { "content-type": "text/html" } }
        );
      }
    }

    // Delegate to hostAgent for all agent routes
    // Routes: /v1/sessions/:id/messages, /v1/sessions/:id/enqueue, /v1/sessions/:id/status, /v1/events
    try {
      const approvalResponse = await prepareMcpForRequest(request, url, env);
      if (approvalResponse) return approvalResponse;
      const hostResponse = await host.handleFetch(request, env);
      const sessionId = url.pathname.match(/\/v1\/sessions\/([^/]+)\//)?.[1];
      return normalizeApprovalResponse(hostResponse, sessionId, env);
    } catch (err) {
      console.error("Fetch error:", err);
      return json(
        { error: err instanceof Error ? err.message : String(err) },
        500
      );
    }
  },

  /**
   * Queue handler: processes turn jobs from the queue.
   * @param {MessageBatch} batch
   * @param {Env} env
   */
  async queue(batch, env) {
    try {
      // Queue turns may run after enqueue; ensure MCP child is still warm.
      await ensureMcpTools(undefined, env);
      await host.handleQueue(batch, env);
    } catch (err) {
      console.error("Queue error:", err);
    }
  },

  /**
   * Scheduled handler: cron triggers for background tasks.
   * @param {ScheduledEvent} event
   * @param {Env} env
   * @param {ExecutionContext} ctx
   */
  async scheduled(event, env, ctx) {
    if (host.handleScheduled) {
      await host.handleScheduled(event, env);
    }
  },
};
