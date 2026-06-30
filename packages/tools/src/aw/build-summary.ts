import {
  aggregateMeetingSessions,
  aggregateTopActivities,
  aggregateTopWebLinks,
  mergeTopActivities,
} from "./aggregate.ts";
import { filterEventsInRange } from "./event-range.ts";
import type {
  ActivityTimeRange,
  AwActivitySummary,
  Bucket,
  LatestWatcherEvent,
  MeetingSession,
  RawEvent,
  TopActivity,
  WatcherKind,
  WebLinkActivity,
} from "./types.ts";

const WATCHERS: WatcherKind[] = ["window", "web", "vscode", "afk"];

/**
 * Infer ActivityWatch watcher kind from a bucket ID string.
 *
 * @param bucketId Bucket ID from ActivityWatch (e.g. `aw-watcher-window_hostname`).
 */
export function watcherFromBucketId(bucketId: string): WatcherKind {
  const id = bucketId.toLowerCase();
  if (id.includes("aw-watcher-window")) return "window";
  if (id.includes("aw-watcher-web")) return "web";
  if (id.includes("aw-watcher-vscode")) return "vscode";
  if (id.includes("aw-watcher-afk")) return "afk";
  return "other";
}

/**
 * Pick the best matching bucket for a watcher on this machine.
 *
 * @param buckets All buckets from ActivityWatch.
 * @param watcher Target watcher kind.
 * @param hostname Optional hostname to disambiguate multi-machine buckets.
 * @returns Matching bucket or `undefined`.
 */
export function pickBucket(
  buckets: Bucket[],
  watcher: WatcherKind,
  hostname?: string
): Bucket | undefined {
  const matches = buckets.filter((b) => watcherFromBucketId(b.id) === watcher);
  if (matches.length === 0) return undefined;

  if (hostname) {
    const hostMatch = matches.find(
      (b) => b.id.includes(hostname) || b.hostname === hostname
    );
    if (hostMatch) return hostMatch;
  }

  return matches[0];
}

function labelFromEvent(
  e: RawEvent,
  watcher: WatcherKind
): { app: string; title: string } {
  const data = e.data ?? {};
  if (watcher === "afk") {
    const status = typeof data.status === "string" ? data.status : "unknown";
    return { app: "afk", title: status };
  }
  const app =
    (typeof data.app === "string" && data.app) ||
    (typeof data.title === "string" && data.title) ||
    "Unknown";
  const title =
    (typeof data.title === "string" && data.title) ||
    (typeof data.url === "string" && data.url) ||
    "";
  return { app, title };
}

function newestEvent(events: RawEvent[]): RawEvent | undefined {
  if (events.length === 0) return undefined;
  return events.reduce((newest, e) =>
    new Date(e.timestamp).getTime() > new Date(newest.timestamp).getTime()
      ? e
      : newest
  );
}

/** Options for buildActivitySummary. */
export type BuildActivitySummaryOptions = {
  /** Hostname used to pick per-machine window/web/vscode/afk buckets. */
  hostname?: string;
};

/**
 * Aggregate raw ActivityWatch events into a structured summary.
 *
 * Pure function — the host fetches buckets and events over HTTP, then passes
 * them here. Use formatActivityContext to produce LLM-ready markdown.
 *
 * @param buckets All AW buckets from `GET /buckets/`.
 * @param eventsByBucket Events keyed by bucket ID (host-fetched, paginated).
 * @param pagesByBucket Number of API pages fetched per bucket (for diagnostics).
 * @param range Time window from resolveActivityRange.
 * @param options Optional `hostname` to pick the correct per-machine buckets.
 * @returns Structured summary with top activities, meetings, web links, and metadata.
 */
export function buildActivitySummary(
  buckets: Bucket[],
  eventsByBucket: Record<string, RawEvent[]>,
  pagesByBucket: Record<string, number>,
  range: ActivityTimeRange,
  options?: BuildActivitySummaryOptions
): AwActivitySummary {
  const { start, end, label } = range;
  const hours = Math.max(
    (end.getTime() - start.getTime()) / (60 * 60 * 1000),
    0.25
  );
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const hostname = options?.hostname;

  const latest: LatestWatcherEvent[] = [];
  const perWatcherTop: TopActivity[] = [];
  let topWebLinks: WebLinkActivity[] = [];
  let meetingSessions: MeetingSession[] = [];
  const eventCounts: Partial<Record<WatcherKind, number>> = {};
  const eventFetchPages: Partial<Record<WatcherKind, number>> = {};
  let afk: { status: string; timestamp: string } | null = null;
  let totalApiCalls = 0;

  for (const watcher of WATCHERS) {
    const bucket = pickBucket(buckets, watcher, hostname);
    if (!bucket) continue;

    const rawEvents = eventsByBucket[bucket.id] ?? [];
    const pages = pagesByBucket[bucket.id] ?? 0;
    const events = filterEventsInRange(rawEvents, startIso, endIso);

    totalApiCalls += pages;
    eventCounts[watcher] = events.length;
    eventFetchPages[watcher] = pages;

    perWatcherTop.push(...aggregateTopActivities(events, watcher));
    if (watcher === "web") {
      topWebLinks = aggregateTopWebLinks(events);
      meetingSessions = aggregateMeetingSessions(events);
    }

    const newest = newestEvent(events);
    if (!newest) continue;

    const { app, title } = labelFromEvent(newest, watcher);
    latest.push({
      watcher,
      bucketId: bucket.id,
      app,
      title,
      timestamp: newest.timestamp,
    });

    if (watcher === "afk") {
      afk = { status: title, timestamp: newest.timestamp };
    }
  }

  const topActivities = mergeTopActivities(perWatcherTop);

  latest.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const totalEventCount = Object.values(eventCounts).reduce(
    (sum, n) => sum + (n ?? 0),
    0
  );

  return {
    connected: true,
    bucketCount: buckets.length,
    rangeHours: hours,
    rangeLabel: label,
    range: { start: startIso, end: endIso },
    afk,
    latest,
    topActivities,
    topWebLinks,
    meetingSessions,
    eventCounts,
    eventFetchPages,
    totalEventCount,
    totalApiCalls,
  };
}
