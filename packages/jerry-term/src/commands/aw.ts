/**
 * /aw-tail command - peek recent ActivityWatch events.
 *
 * Diagnostic helper to verify jerry-term can reach ActivityWatch
 * and inspect the latest raw events.
 */

import type { Bucket, RawEvent } from "@mieweb/jerry-tools";
import { DEFAULT_AW_URL } from "../tools/types.ts";
import type { Command, CommandContext } from "./types.ts";

const DEFAULT_LIMIT = 50;
const FETCH_TIMEOUT_MS = 10_000;

interface AwInfoResponse {
  hostname?: string;
  version?: string;
  testing?: boolean;
}

interface BucketsResponse {
  [key: string]: Bucket;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "?";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
}

function formatEventLine(event: RawEvent, index: number): string {
  const ts = event.timestamp?.replace("T", " ").replace(/\+00:00$/, "Z") ?? "?";
  const dur = formatDuration(event.duration);
  const data = event.data ?? {};
  const app = typeof data.app === "string" ? data.app : undefined;
  const title = typeof data.title === "string" ? data.title : undefined;
  const url = typeof data.url === "string" ? data.url : undefined;
  const status = typeof data.status === "string" ? data.status : undefined;
  const file = typeof data.file === "string" ? data.file : undefined;

  const parts: string[] = [];
  if (app) parts.push(app);
  if (title) parts.push(title);
  if (url) parts.push(url);
  if (file) parts.push(file);
  if (status) parts.push(status);
  if (parts.length === 0) {
    parts.push(JSON.stringify(data));
  }

  const detail = parts.join(" | ");
  const truncated = detail.length > 120 ? `${detail.slice(0, 117)}...` : detail;
  return `  ${String(index).padStart(2, " ")}. [${ts}] (${dur}) ${truncated}`;
}

function pickPrimaryBucket(buckets: Bucket[]): Bucket | undefined {
  const ranked = [...buckets].sort((a, b) => {
    const aWindow = a.id.includes("aw-watcher-window") ? 0 : 1;
    const bWindow = b.id.includes("aw-watcher-window") ? 0 : 1;
    if (aWindow !== bWindow) return aWindow - bWindow;
    const aUpdated = a.last_updated ? Date.parse(a.last_updated) : 0;
    const bUpdated = b.last_updated ? Date.parse(b.last_updated) : 0;
    return bUpdated - aUpdated;
  });
  return ranked[0];
}

function parseArgs(args: string[]): { limit: number; bucketId?: string } {
  let limit = DEFAULT_LIMIT;
  let bucketId: string | undefined;

  for (const arg of args) {
    if (/^\d+$/.test(arg)) {
      limit = Math.min(Math.max(Number.parseInt(arg, 10), 1), 200);
      continue;
    }
    bucketId = arg;
  }

  return { limit, bucketId };
}

export const awTailCommand: Command = {
  name: "aw-tail",
  aliases: ["aw", "activity"],
  description: "Peek the latest ActivityWatch events (connectivity check)",
  usage: "/aw-tail [limit] [bucket-id]",

  async execute(args: string[], ctx: CommandContext): Promise<void> {
    const awUrl = process.env.AW_URL ?? DEFAULT_AW_URL;
    const { limit, bucketId } = parseArgs(args);

    ctx.output.writeLine(`ActivityWatch @ ${awUrl}`);

    try {
      const infoRes = await fetchWithTimeout(`${awUrl}/api/0/info`, FETCH_TIMEOUT_MS);
      if (!infoRes.ok) {
        ctx.output.writeLine(`Unreachable: HTTP ${infoRes.status} from /api/0/info`);
        return;
      }
      const info = (await infoRes.json()) as AwInfoResponse;
      const version = info.version ?? "?";
      ctx.output.writeLine(
        `Connected: ${version.startsWith("v") ? version : `v${version}`} on ${info.hostname ?? "unknown"}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.output.writeLine(`Unreachable: ${message}`);
      ctx.output.writeLine("Start ActivityWatch, then retry /aw-tail.");
      return;
    }

    let buckets: Bucket[];
    try {
      const bucketsRes = await fetchWithTimeout(
        `${awUrl}/api/0/buckets/`,
        FETCH_TIMEOUT_MS
      );
      if (!bucketsRes.ok) {
        ctx.output.writeLine(`Failed to list buckets: HTTP ${bucketsRes.status}`);
        return;
      }
      const bucketsData = (await bucketsRes.json()) as BucketsResponse;
      buckets = Object.values(bucketsData);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.output.writeLine(`Failed to list buckets: ${message}`);
      return;
    }

    if (buckets.length === 0) {
      ctx.output.writeLine("No buckets found.");
      return;
    }

    ctx.output.writeLine(`Buckets (${buckets.length}):`);
    for (const bucket of buckets) {
      const updated = bucket.last_updated
        ? bucket.last_updated.replace("T", " ").replace(/\+00:00$/, "Z")
        : "never";
      ctx.output.writeLine(`  - ${bucket.id}  (updated ${updated})`);
    }

    const target =
      (bucketId ? buckets.find((b) => b.id === bucketId) : undefined) ??
      (bucketId ? undefined : pickPrimaryBucket(buckets));

    if (!target) {
      ctx.output.writeLine(`Unknown bucket: ${bucketId}`);
      ctx.output.writeLine("Pass a bucket id from the list above.");
      return;
    }

    ctx.output.writeLine("");
    ctx.output.writeLine(`Latest ${limit} events from ${target.id}:`);

    try {
      // No trailing slash — AW 0.13 serves /events, not /events/
      const eventsUrl = new URL(
        `${awUrl}/api/0/buckets/${encodeURIComponent(target.id)}/events`
      );
      eventsUrl.searchParams.set("limit", String(limit));

      const eventsRes = await fetchWithTimeout(eventsUrl.toString(), FETCH_TIMEOUT_MS);
      if (!eventsRes.ok) {
        ctx.output.writeLine(`Failed to fetch events: HTTP ${eventsRes.status}`);
        return;
      }

      const events = (await eventsRes.json()) as RawEvent[];
      if (events.length === 0) {
        ctx.output.writeLine("  (no events)");
        return;
      }

      events.forEach((event, i) => {
        ctx.output.writeLine(formatEventLine(event, i + 1));
      });
      ctx.output.writeLine(`Fetched ${events.length} event(s).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.output.writeLine(`Failed to fetch events: ${message}`);
    }
  },
};
