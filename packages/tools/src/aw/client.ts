/**
 * ActivityWatch HTTP client — fetch buckets/events for an arbitrary time range.
 *
 * Used by summarize_activity for on-demand historical lookups so Jerry is not
 * limited to whatever the collector happened to ingest (its first poll only
 * pulls the last 2 hours).
 */

import type { Bucket, RawEvent } from "./types.ts";

export const DEFAULT_AW_URL = "http://localhost:5600";

export interface AwActivitySlice {
  buckets: Bucket[];
  eventsByBucket: Record<string, RawEvent[]>;
  pagesByBucket: Record<string, number>;
  /** Total raw events across all buckets. */
  eventCount: number;
}

interface AwBucketMeta {
  id: string;
  type?: string;
  client?: string;
  hostname?: string;
  created?: string;
  last_updated?: string;
}

/**
 * Resolve the ActivityWatch base URL (env override, then default).
 */
export function resolveAwUrl(override?: string): string {
  return (
    override ??
    (typeof process !== "undefined" ? process.env?.AW_URL : undefined) ??
    DEFAULT_AW_URL
  ).replace(/\/$/, "");
}

/**
 * Whether a bucket is a window/web watcher we care about for activity summaries.
 */
export function isActivityBucket(bucket: AwBucketMeta, id: string): boolean {
  return (
    bucket.type === "currentwindow" ||
    bucket.type === "web.tab.current" ||
    id.includes("aw-watcher-window") ||
    id.includes("aw-watcher-web")
  );
}

/**
 * Discover window/web ActivityWatch buckets.
 * Returns [] when AW is unreachable or has no matching buckets.
 */
export async function discoverActivityBuckets(
  awUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<Bucket[]> {
  try {
    // Trailing slash avoids AW's redirect from /buckets → /buckets/
    const response = await fetchImpl(`${awUrl}/api/0/buckets/`);
    if (!response.ok) return [];

    const data = (await response.json()) as Record<string, AwBucketMeta>;
    const buckets: Bucket[] = [];

    for (const [id, bucket] of Object.entries(data)) {
      if (!isActivityBucket(bucket, id)) continue;
      buckets.push({
        id,
        type: bucket.type,
        client: bucket.client,
        hostname: bucket.hostname,
        created: bucket.created,
        last_updated: bucket.last_updated,
      });
    }

    return buckets;
  } catch {
    return [];
  }
}

/**
 * Fetch events for one bucket in [start, end).
 * Uses limit=-1 so historical days are not truncated by AW's default page size.
 */
export async function fetchBucketEventsInRange(
  awUrl: string,
  bucketId: string,
  start: Date,
  end: Date,
  fetchImpl: typeof fetch = fetch
): Promise<RawEvent[]> {
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
    limit: "-1",
  });

  try {
    const response = await fetchImpl(
      `${awUrl}/api/0/buckets/${encodeURIComponent(bucketId)}/events?${params}`
    );
    if (!response.ok) return [];
    const events = (await response.json()) as RawEvent[];
    return Array.isArray(events) ? events : [];
  } catch {
    return [];
  }
}

/**
 * Probe whether ActivityWatch is reachable.
 */
export async function isAwReachable(
  awUrl: string,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  try {
    const response = await fetchImpl(`${awUrl}/api/0/info`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch window/web activity for an arbitrary time range from ActivityWatch.
 *
 * Returns `null` when AW is unreachable (caller should fall back to the DB).
 * Returns an empty slice (eventCount 0) when AW is up but has no events.
 */
export async function fetchAwActivityRange(options: {
  start: Date;
  end: Date;
  awUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<AwActivitySlice | null> {
  const awUrl = resolveAwUrl(options.awUrl);
  const fetchImpl = options.fetchImpl ?? fetch;

  const reachable = await isAwReachable(awUrl, fetchImpl);
  if (!reachable) return null;

  const buckets = await discoverActivityBuckets(awUrl, fetchImpl);
  const eventsByBucket: Record<string, RawEvent[]> = {};
  const pagesByBucket: Record<string, number> = {};
  let eventCount = 0;

  for (const bucket of buckets) {
    const events = await fetchBucketEventsInRange(
      awUrl,
      bucket.id,
      options.start,
      options.end,
      fetchImpl
    );
    eventsByBucket[bucket.id] = events;
    pagesByBucket[bucket.id] = 1;
    eventCount += events.length;
  }

  return { buckets, eventsByBucket, pagesByBucket, eventCount };
}
