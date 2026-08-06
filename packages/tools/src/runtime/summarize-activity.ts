/**
 * summarize_activity tool — get activity summary for a time range.
 *
 * Prefers a live ActivityWatch fetch for the exact requested range so historical
 * days work even when the collector only ingested the last few hours. Falls
 * back to collector-pushed rows in Jerry's DB when AW is unreachable.
 */

import { tool } from "ai";
import { z } from "zod";
import type { ToolContext, StoredActivityEvent } from "./types.js";
import {
  resolveActivityRange,
  buildActivitySummary,
  formatActivityContext,
} from "../index.js";
import type { Bucket, RawEvent } from "../aw/types.js";
import { fetchAwActivityRange } from "../aw/client.js";

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
    pagesByBucket[bucketId] = 1;
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

type ActivitySource = "activitywatch" | "jerry-db";

/**
 * Resolve activity data for a range: live AW first, then Jerry DB fallback.
 */
async function loadActivityForRange(
  db: ToolContext["db"],
  start: Date,
  end: Date
): Promise<{
  buckets: Bucket[];
  eventsByBucket: Record<string, RawEvent[]>;
  pagesByBucket: Record<string, number>;
  source: ActivitySource | null;
  awReachable: boolean;
}> {
  const awSlice = await fetchAwActivityRange({ start, end });

  if (awSlice && awSlice.eventCount > 0) {
    return {
      buckets: awSlice.buckets,
      eventsByBucket: awSlice.eventsByBucket,
      pagesByBucket: awSlice.pagesByBucket,
      source: "activitywatch",
      awReachable: true,
    };
  }

  const events = await queryActivityEvents(
    db,
    start.toISOString(),
    end.toISOString()
  );
  const fromDb = transformToAwFormat(events);

  if (fromDb.buckets.length > 0) {
    return {
      ...fromDb,
      source: "jerry-db",
      awReachable: awSlice !== null,
    };
  }

  return {
    buckets: [],
    eventsByBucket: {},
    pagesByBucket: {},
    source: null,
    awReachable: awSlice !== null,
  };
}

/**
 * Create the summarize_activity tool.
 */
export function createSummarizeActivityTool(ctx: ToolContext) {
  return tool({
    description:
      "Get a summary of the user's activity for a specified time range. " +
      "Analyzes ActivityWatch data to show what applications were used, " +
      "websites visited, meetings attended, and overall productivity patterns. " +
      "Supports any calendar day or rolling window (e.g. 'July 22', '2026-06-26', 'last 2 hours', 'today').",
    parameters: z.object({
      range: z
        .string()
        .describe(
          "Natural language time range, e.g. 'last 2 hours', 'today', 'yesterday', 'July 22', '2026-06-26', 'May 10 to May 13'"
        ),
    }),
    execute: async ({ range }) => {
      let resolved;
      try {
        resolved = resolveActivityRange(range, undefined, undefined, {
          strict: false,
        });
      } catch {
        return {
          error: true,
          message: `Could not parse time range: "${range}". Try something like "last 2 hours", "today", "July 22", or "2026-06-26".`,
        };
      }

      const { start, end, label } = resolved;
      const startISO = start.toISOString();
      const endISO = end.toISOString();

      const loaded = await loadActivityForRange(ctx.db, start, end);

      if (!loaded.source) {
        const hint = loaded.awReachable
          ? `ActivityWatch has no events for ${label}.`
          : `ActivityWatch is unreachable and Jerry's local store has no events for ${label}. Is ActivityWatch running on localhost:5600?`;

        return {
          error: false,
          message: `No evidence from ActivityWatch for ${range}. ${hint}`,
          range: { start: startISO, end: endISO, label },
          summary: null,
        };
      }

      const summary = buildActivitySummary(
        loaded.buckets,
        loaded.eventsByBucket,
        loaded.pagesByBucket,
        { start, end, label }
      );

      await saveSummary(ctx.db, ctx.sessionId, startISO, endISO, summary);

      const formatted = formatActivityContext(summary);

      return {
        error: false,
        range: { start: startISO, end: endISO, label },
        dataSource: loaded.source,
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
