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
import { resolveRuntime, mergeProfile } from "@mieweb/jerry-agent-runtime";
import { createJerryTools, getEmbedding } from "@mieweb/jerry-tools/runtime";
import { jerry } from "../src/agent.ts";

/**
 * Create the host wiring for Jerry.
 * This is called once at module load time.
 */
const host = hostAgent({
  agent: jerry,
  createRuntime: (profile) => {
    return resolveRuntime(mergeProfile(profile));
  },
  createTools: createJerryTools,
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
