export const PACKAGE = "@mieweb/jerry-tools";

// Types
export type {
  ActivityTimeRange,
  AwActivityError,
  AwActivityResult,
  AwActivitySummary,
  Bucket,
  LatestWatcherEvent,
  MeetingPlatform,
  MeetingSession,
  RawEvent,
  TopActivity,
  WatcherKind,
  WebLinkActivity,
} from "./aw/types.ts";

// Intent (range resolution)
export {
  formatActivityWindowLog,
  mentionsFullHistory,
  mentionsYesterday,
  parseActivityRangeFromPrompt,
  rangeFromActivityWatchBuckets,
  resolveActivityRange,
  resolveRangeHours,
  SNAPSHOT_MAX_HOURS,
  SNAPSHOT_MIN_HOURS,
  validateSnapshotRange,
} from "./aw/intent.ts";
export type { ActivityTimeHint } from "./aw/intent.ts";

// Event range
export { filterEventsInRange } from "./aw/event-range.ts";

// Aggregation
export {
  aggregateMeetingSessions,
  aggregateTopActivities,
  aggregateTopWebLinks,
  isWorkRelatedUrl,
  mergeTopActivities,
} from "./aw/aggregate.ts";

// Build summary
export {
  buildActivitySummary,
  pickBucket,
  watcherFromBucketId,
} from "./aw/build-summary.ts";
export type { BuildActivitySummaryOptions } from "./aw/build-summary.ts";

// Format
export { formatActivityContext } from "./aw/format.ts";

// Time format utilities
export { formatLocalTimeRange } from "./aw/time-format.ts";

// ActivityWatch HTTP client (on-demand historical fetch)
export {
  DEFAULT_AW_URL,
  discoverActivityBuckets,
  fetchAwActivityRange,
  fetchBucketEventsInRange,
  isAwReachable,
  isActivityBucket,
  resolveAwUrl,
} from "./aw/client.ts";
export type { AwActivitySlice } from "./aw/client.ts";
