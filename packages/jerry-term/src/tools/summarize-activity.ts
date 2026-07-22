/**
 * Local summarize_activity tool that calls ActivityWatch HTTP directly.
 *
 * Bypasses the collector/D1 path - fetches events directly from AW API
 * and uses existing aggregation logic from @mieweb/jerry-tools.
 */

import { tool } from "ai";
import { z } from "zod";
import type { Bucket, RawEvent } from "@mieweb/jerry-tools";
import {
  buildActivitySummary,
  formatActivityContext,
  resolveActivityRange,
} from "@mieweb/jerry-tools";
import type { LocalToolContext } from "./types.ts";

const MAX_EVENTS_PER_BUCKET = 5000;
const FETCH_TIMEOUT_MS = 60000;

class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new TimeoutError(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

interface BucketsResponse {
  [key: string]: Bucket;
}

export function createLocalSummarizeActivityTool(ctx: LocalToolContext) {
  return tool({
    description:
      "Summarize user activity from ActivityWatch for a given time period. " +
      "Supports natural language dates like 'today', 'yesterday', 'July 13', 'last 2 hours'.",
    parameters: z.object({
      timeRange: z
        .string()
        .describe(
          "Time range to summarize (e.g., 'today', 'yesterday', 'July 13', 'last 2 hours')"
        ),
    }),

    execute: async ({ timeRange }) => {
      try {
        // Fetch buckets (trailing slash required - AW redirects without it)
        const bucketsRes = await fetchWithTimeout(
          ctx.fetchFn,
          `${ctx.awUrl}/api/0/buckets/`,
          FETCH_TIMEOUT_MS
        );
        if (!bucketsRes.ok) {
          return `ActivityWatch is not responding (HTTP ${bucketsRes.status}). Make sure it's running.`;
        }

        const bucketsData = (await bucketsRes.json()) as BucketsResponse;
        const buckets = Object.values(bucketsData);

        if (buckets.length === 0) {
          return "No ActivityWatch buckets found. ActivityWatch may be running but has no data yet.";
        }

        // Resolve time range from natural language
        const range = resolveActivityRange(timeRange, undefined, buckets, {
          strict: false,
        });

        // Fetch events for each bucket
        const eventsByBucket: Record<string, RawEvent[]> = {};
        const pagesByBucket: Record<string, number> = {};

        const startIso = range.start.toISOString();
        const endIso = range.end.toISOString();

        for (const bucket of buckets) {
          try {
            // No trailing slash — AW 0.13 serves /events ( /events/ returns 404 )
            const eventsUrl = new URL(
              `${ctx.awUrl}/api/0/buckets/${encodeURIComponent(bucket.id)}/events`
            );
            eventsUrl.searchParams.set("start", startIso);
            eventsUrl.searchParams.set("end", endIso);
            eventsUrl.searchParams.set("limit", String(MAX_EVENTS_PER_BUCKET));

            const eventsRes = await fetchWithTimeout(
              ctx.fetchFn,
              eventsUrl.toString(),
              FETCH_TIMEOUT_MS
            );
            if (eventsRes.ok) {
              const events = (await eventsRes.json()) as RawEvent[];
              eventsByBucket[bucket.id] = events;
              pagesByBucket[bucket.id] = 1;
            } else {
              eventsByBucket[bucket.id] = [];
              pagesByBucket[bucket.id] = 0;
            }
          } catch (bucketError) {
            // Log bucket-level errors for debugging
            console.error(`[summarize_activity] Error fetching bucket ${bucket.id}:`, bucketError);
            eventsByBucket[bucket.id] = [];
            pagesByBucket[bucket.id] = 0;
          }
        }

        // Build and format summary using existing logic
        const summary = buildActivitySummary(
          buckets,
          eventsByBucket,
          pagesByBucket,
          range
        );

        return formatActivityContext(summary);
      } catch (error) {
        console.error("[summarize_activity] Error:", error);
        if (error instanceof TimeoutError) {
          return "ActivityWatch request timed out. The server may be slow or unresponsive.";
        }
        if (error instanceof Error) {
          if (error.message.includes("ECONNREFUSED") || error.message.includes("fetch failed")) {
            return "ActivityWatch is not running. Please start ActivityWatch and try again.";
          }
          return `Error fetching activity data: ${error.message}`;
        }
        return "Unknown error fetching activity data.";
      }
    },
  });
}
