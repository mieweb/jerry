/**
 * ActivityWatch watcher kind inferred from bucket IDs.
 */
export type WatcherKind = "window" | "web" | "vscode" | "afk" | "other";

/**
 * ActivityWatch bucket metadata from `GET /buckets/`.
 */
export type Bucket = {
  id: string;
  type?: string;
  client?: string;
  hostname?: string;
  created?: string;
  last_updated?: string;
};

/**
 * Raw ActivityWatch event from `GET /buckets/{id}/events`.
 */
export type RawEvent = {
  timestamp: string;
  duration: number;
  data: Record<string, unknown>;
};

/**
 * Resolved ActivityWatch time window with a human-readable label.
 */
export type ActivityTimeRange = {
  /** Inclusive range start (local semantics). */
  start: Date;
  /** Exclusive or current-time end. */
  end: Date;
  /** Description shown in reports and logs. */
  label: string;
};

/**
 * Aggregated app/title duration for one watcher.
 */
export type TopActivity = {
  watcher: WatcherKind;
  app: string;
  title: string;
  durationSeconds: number;
  eventCount: number;
};

/**
 * Work-related web page ranked by tracked duration.
 */
export type WebLinkActivity = {
  url: string;
  title: string;
  durationSeconds: number;
  eventCount: number;
};

/**
 * Video meeting platform detected from a URL.
 */
export type MeetingPlatform = "google-meet" | "zoom" | "teams" | "other";

/**
 * Contiguous meeting session merged from web watcher events.
 */
export type MeetingSession = {
  platform: MeetingPlatform;
  url: string;
  meetingCode?: string;
  title: string;
  start: string;
  end: string;
  durationSeconds: number;
  eventCount: number;
};

/**
 * Most recent event for a watcher within the resolved time range.
 */
export type LatestWatcherEvent = {
  watcher: WatcherKind;
  bucketId: string;
  app: string;
  title: string;
  timestamp: string;
};

/**
 * Successful ActivityWatch aggregation result from buildActivitySummary.
 */
export type AwActivitySummary = {
  connected: true;
  bucketCount: number;
  rangeHours: number;
  rangeLabel: string;
  range: { start: string; end: string };
  afk: { status: string; timestamp: string } | null;
  latest: LatestWatcherEvent[];
  topActivities: TopActivity[];
  topWebLinks: WebLinkActivity[];
  meetingSessions: MeetingSession[];
  eventCounts: Partial<Record<WatcherKind, number>>;
  eventFetchPages: Partial<Record<WatcherKind, number>>;
  totalEventCount: number;
  totalApiCalls: number;
};

/**
 * ActivityWatch fetch or aggregation failure (host-level connectivity).
 */
export type AwActivityError = {
  connected: false;
  error: string;
};

/**
 * Union of successful summary or connectivity error.
 */
export type AwActivityResult = AwActivitySummary | AwActivityError;
