/**
 * summarize_activity tool — get activity summary for a time range.
 *
 * Uses the AW pure functions from packages/tools to process activity data
 * from the database (collector-pushed events).
 */

import { tool } from "ai";
import { z } from "zod";
import type { ToolContext, StoredActivityEvent } from "./types.js";
import {
  resolveActivityRange,
  buildActivitySummary,
  formatActivityContext,
} from "../index.js";
import type { RawEvent, Bucket } from "../aw/types.js";

interface ActivityEventRow {
  id: string;
  source: string;
  payload: string | null;
  occurred_at: string;
}

/**
 * Query activity events from the database.
 */
async function queryActivityEvents(
  db: ToolContext["db"],
  start: string,
  end: string
): Promise<StoredActivityEvent[]> {
  const rows = await db
    .prepare(
      `SELECT id, source, payload, occurred_at
       FROM activity_events
       WHERE occurred_at >= ? AND occurred_at <= ?
       ORDER BY occurred_at ASC`
    )
    .bind(start, end)
    .all<ActivityEventRow>();

  return (rows.results ?? []).map((row: ActivityEventRow) => ({
    id: row.id,
    source: row.source,
    payload: row.payload ? JSON.parse(row.payload) : null,
    occurredAt: row.occurred_at,
  }));
}

interface AwEventPayload {
  bucketId?: string;
  events?: RawEvent[];
}

/**
 * Transform stored events into the format expected by buildActivitySummary.
 * Returns buckets metadata and events keyed by bucket ID.
 */
function transformToAwFormat(events: StoredActivityEvent[]): {
  buckets: Bucket[];
  eventsByBucket: Record<string, RawEvent[]>;
  pagesByBucket: Record<string, number>;
} {
  const bucketMap = new Map<string, { bucket: Bucket; events: RawEvent[] }>();

  for (const event of events) {
    if (event.source !== "aw") continue;

    const payload = event.payload as AwEventPayload | null;
    if (!payload?.bucketId || !payload.events) continue;

    const existing = bucketMap.get(payload.bucketId);
    if (existing) {
      existing.events.push(...payload.events);
    } else {
      bucketMap.set(payload.bucketId, {
        bucket: { id: payload.bucketId },
        events: [...payload.events],
      });
    }
  }

  const buckets: Bucket[] = [];
  const eventsByBucket: Record<string, RawEvent[]> = {};
  const pagesByBucket: Record<string, number> = {};

  for (const [bucketId, data] of bucketMap) {
    buckets.push(data.bucket);
    eventsByBucket[bucketId] = data.events;
    pagesByBucket[bucketId] = 1; // Collector pushes in batches, treat as 1 page
  }

  return { buckets, eventsByBucket, pagesByBucket };
}

/**
 * Save summary to the database.
 */
async function saveSummary(
  db: ToolContext["db"],
  sessionId: string,
  rangeStart: string,
  rangeEnd: string,
  summary: unknown
): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO summaries (id, session_id, range_start, range_end, summary, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, sessionId, rangeStart, rangeEnd, JSON.stringify(summary), now)
    .run();

  return id;
}

/**
 * Create the summarize_activity tool.
 */
export function createSummarizeActivityTool(ctx: ToolContext) {
  return tool({
    description:
      "Get a summary of the user's activity for a specified time range. " +
      "Analyzes ActivityWatch data to show what applications were used, " +
      "websites visited, meetings attended, and overall productivity patterns.",
    parameters: z.object({
      range: z
        .string()
        .describe(
          "Natural language time range, e.g. 'last 2 hours', 'today', 'yesterday afternoon', 'this morning'"
        ),
    }),
    execute: async ({ range }) => {
      // Parse the time range from natural language
      let resolved;
      try {
        resolved = resolveActivityRange(range, undefined, undefined, { strict: false });
      } catch {
        return {
          error: true,
          message: `Could not parse time range: "${range}". Try something like "last 2 hours" or "today".`,
        };
      }

      const { start, end, label } = resolved;
      const startISO = start.toISOString();
      const endISO = end.toISOString();

      // Query activity events from the database
      const events = await queryActivityEvents(ctx.db, startISO, endISO);

      if (events.length === 0) {
        return {
          error: false,
          message: `No activity data found for ${range}. The collector may not be running or no events have been captured yet.`,
          range: { start: startISO, end: endISO },
          summary: null,
        };
      }

      // Transform events into AW format
      const { buckets, eventsByBucket, pagesByBucket } = transformToAwFormat(events);

      if (buckets.length === 0) {
        return {
          error: false,
          message: `Found ${events.length} events but none were AW activity data.`,
          range: { start: startISO, end: endISO },
          summary: null,
        };
      }

      // Build the activity summary using pure functions
      const summary = buildActivitySummary(
        buckets,
        eventsByBucket,
        pagesByBucket,
        { start, end, label }
      );

      // Save the summary to the database
      await saveSummary(ctx.db, ctx.sessionId, startISO, endISO, summary);

      // Format for the agent
      const formatted = formatActivityContext(summary);

      return {
        error: false,
        range: { start: startISO, end: endISO },
        formatted,
        summary: {
          bucketCount: summary.bucketCount,
          rangeHours: summary.rangeHours,
          topActivities: summary.topActivities.slice(0, 5),
          topWebLinks: summary.topWebLinks.slice(0, 5),
          meetingCount: summary.meetingSessions.length,
          totalEventCount: summary.totalEventCount,
        },
      };
    },
  });
}
