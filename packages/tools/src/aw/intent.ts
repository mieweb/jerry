import type { ActivityTimeRange, Bucket } from "./types.ts";
import { NO_TIME_RANGE_ERROR, parseCalendarRangeFromPrompt } from "./dates.ts";

const MAX_EXPLICIT_HOURS = 24 * 90;

/** Minimum hours for a snapshot time range (15 minutes). */
export const SNAPSHOT_MIN_HOURS = 0.25;

/** Maximum hours for a snapshot time range (2 hours). */
export const SNAPSHOT_MAX_HOURS = 2;

/** Parsed time range or `null` when the prompt has no recognizable window. */
export type ActivityTimeHint = ActivityTimeRange | null;

function hoursBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (60 * 60 * 1000);
}

function rollingHours(hours: number, label: string): ActivityTimeRange {
  const end = new Date();
  const h = Math.min(Math.max(hours, 0.25), MAX_EXPLICIT_HOURS);
  const start = new Date(end.getTime() - h * 60 * 60 * 1000);
  return { start, end, label };
}

function localMidnight(d: Date = new Date()): Date {
  const m = new Date(d);
  m.setHours(0, 0, 0, 0);
  return m;
}

function calendarToday(): ActivityTimeRange {
  const end = new Date();
  const start = localMidnight(end);
  return {
    start,
    end,
    label: "Today (since local midnight)",
  };
}

/**
 * Whether lowercase prompt text refers to yesterday's full calendar day.
 *
 * @param lower Prompt text already lowercased.
 */
export function mentionsYesterday(lower: string): boolean {
  if (/\byesterday\b/.test(lower) || /\byesterdays\b/.test(lower)) {
    return true;
  }
  if (/\b(previous|prior)\s+day\b/.test(lower)) {
    return true;
  }
  if (/\bthe\s+day\s+before(\s+yesterday)?\b/.test(lower)) {
    return true;
  }
  if (
    /\b(last|past)\s+day\b/.test(lower) &&
    !/\b(last|past)\s+\d+\s+days?\b/.test(lower)
  ) {
    return true;
  }
  return false;
}

/**
 * Format a time range for host logging (locale-aware start/end strings).
 *
 * @param range Resolved ActivityTimeRange.
 */
export function formatActivityWindowLog(range: ActivityTimeRange): string {
  const start = range.start.toLocaleString();
  const end = range.end.toLocaleString();
  return `${range.label} (${start} → ${end})`;
}

function calendarYesterday(): ActivityTimeRange {
  const todayStart = localMidnight();
  const start = new Date(todayStart);
  start.setDate(start.getDate() - 1);
  return {
    start,
    end: todayStart,
    label: "Yesterday (full calendar day, local time)",
  };
}

/**
 * Whether lowercase prompt text requests full ActivityWatch history.
 *
 * @param lower Prompt text already lowercased.
 */
export function mentionsFullHistory(lower: string): boolean {
  if (/\ball\s+time\b/.test(lower)) return true;
  if (
    /\b(entire|full)\s+(history|timeline|activitywatch|activity)\b/.test(lower)
  ) {
    return true;
  }
  if (/\ball\s+(my\s+)?(activity|data)\b/.test(lower)) return true;
  if (
    /\beverything\s+(on|from|in)\s+(my\s+)?(machine|computer|activitywatch)\b/.test(
      lower
    )
  ) {
    return true;
  }
  if (/\bsince\s+(i\s+)?(installed|started|began)\b/.test(lower)) return true;
  return false;
}

/**
 * Build a time range spanning all bucket `created` timestamps on this machine.
 *
 * @param buckets ActivityWatch buckets from the host HTTP client.
 */
export function rangeFromActivityWatchBuckets(
  buckets: Bucket[]
): ActivityTimeRange {
  const end = new Date();
  let startMs = end.getTime();

  for (const bucket of buckets) {
    if (bucket.created) {
      const createdMs = new Date(bucket.created).getTime();
      if (Number.isFinite(createdMs) && createdMs < startMs) {
        startMs = createdMs;
      }
    }
  }

  if (startMs >= end.getTime()) {
    startMs = end.getTime() - 24 * 60 * 60 * 1000;
  }

  const start = new Date(startMs);
  const startLabel = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return {
    start,
    end,
    label: `All ActivityWatch data on this machine (since ${startLabel})`,
  };
}

/**
 * Parse a time window from natural-language text without throwing.
 *
 * @param text User prompt (report argument, chat message, etc.).
 * @returns Resolved range or `null` when no pattern matches.
 */
export function parseActivityRangeFromPrompt(text: string): ActivityTimeHint {
  const calendar = parseCalendarRangeFromPrompt(text);
  if (calendar) {
    return calendar;
  }

  const lower = text.toLowerCase();

  const lastNHours = lower.match(/last\s+(\d+(?:\.\d+)?)\s*hours?/);
  if (lastNHours) {
    const n = parseFloat(lastNHours[1]);
    if (Number.isFinite(n) && n > 0) {
      return rollingHours(n, `Last ${n} hours`);
    }
  }

  const pastNHours = lower.match(/past\s+(\d+(?:\.\d+)?)\s*hours?/);
  if (pastNHours) {
    const n = parseFloat(pastNHours[1]);
    if (Number.isFinite(n) && n > 0) {
      return rollingHours(n, `Past ${n} hours`);
    }
  }

  if (/\blast\s+hour\b/.test(lower) || /\bpast\s+hour\b/.test(lower)) {
    return rollingHours(1, "Last hour");
  }

  if (mentionsYesterday(lower)) {
    return calendarYesterday();
  }

  if (/\btoday\b/.test(lower) || /\bsince\s+morning\b/.test(lower)) {
    return calendarToday();
  }

  if (/\bthis\s+morning\b/.test(lower) || /\bthis\s+afternoon\b/.test(lower)) {
    return calendarToday();
  }

  return null;
}

/**
 * Parse a natural-language prompt into an ActivityWatch time window.
 *
 * Recognizes `today`, `yesterday`, rolling hours (`last 2 hours`), calendar
 * ranges (`"May 13 to May 20"`), and full-history phrases when bucket metadata
 * is available.
 *
 * @param prompt User text (e.g. report command argument).
 * @param hoursFlag Optional fixed hour window (CLI `--hours` flag).
 * @param buckets Optional bucket list for full-history resolution.
 * @param options `strict: false` falls back to today when parsing fails.
 * @returns `{ start, end, label }` in local time semantics.
 */
export function resolveActivityRange(
  prompt: string,
  hoursFlag?: number,
  buckets?: Bucket[],
  options?: { strict?: boolean }
): ActivityTimeRange {
  const strict = options?.strict !== false;
  if (hoursFlag !== undefined && Number.isFinite(hoursFlag) && hoursFlag > 0) {
    return rollingHours(hoursFlag, `Last ${hoursFlag} hours (--hours)`);
  }

  const parsed = parseActivityRangeFromPrompt(prompt);
  if (parsed) {
    return parsed;
  }

  const lower = prompt.toLowerCase();
  if (mentionsFullHistory(lower) && buckets && buckets.length > 0) {
    return rangeFromActivityWatchBuckets(buckets);
  }

  if (!strict) {
    return calendarToday();
  }

  throw new Error(NO_TIME_RANGE_ERROR);
}

/**
 * Compute the span in hours for a resolved activity range.
 *
 * @param prompt User text passed to resolveActivityRange.
 * @param hoursFlag Optional fixed hour window.
 * @param buckets Optional buckets for full-history resolution.
 * @returns Hours between `start` and `end`.
 */
export function resolveRangeHours(
  prompt: string,
  hoursFlag?: number,
  buckets?: Bucket[]
): number {
  const range = resolveActivityRange(prompt, hoursFlag, buckets);
  return hoursBetween(range.start, range.end);
}

/**
 * Validate that a time range falls within snapshot bounds (15min–2hr).
 *
 * @param range Resolved ActivityTimeRange to validate.
 * @throws Error if the range is shorter than 15 minutes or longer than 2 hours.
 */
export function validateSnapshotRange(range: ActivityTimeRange): void {
  const hours = hoursBetween(range.start, range.end);
  if (hours < SNAPSHOT_MIN_HOURS) {
    throw new Error(
      `Snapshot range too short: ${hours.toFixed(2)}h (minimum ${SNAPSHOT_MIN_HOURS}h)`
    );
  }
  if (hours > SNAPSHOT_MAX_HOURS) {
    throw new Error(
      `Snapshot range too long: ${hours.toFixed(2)}h (maximum ${SNAPSHOT_MAX_HOURS}h)`
    );
  }
}
