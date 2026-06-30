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

import { hostAgent } from "@mieweb/cloud-agent";
import { resolveRuntime, DEFAULT_PRIVACY_PROFILE } from "@mieweb/jerry-agent-runtime";
import { jerry } from "../src/agent.ts";

/**
 * Create the host wiring for Jerry.
 * This is called once at module load time.
 */
const host = hostAgent({
  agent: jerry,
  createRuntime: (profile) => {
    // Use provided profile or fall back to default
    const resolvedProfile = profile ?? DEFAULT_PRIVACY_PROFILE;
    return resolveRuntime(resolvedProfile);
  },
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

    // Delegate to hostAgent for all agent routes
    // Routes: /v1/sessions/:id/messages, /v1/sessions/:id/enqueue, /v1/sessions/:id/status, /v1/events
    try {
      return await host.handleFetch(request, env);
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
