import type { RawEvent } from "./types.ts";

/**
 * Keep only events whose timestamp falls in `[start, end)`.
 *
 * @param events Raw ActivityWatch events for one bucket.
 * @param startIso Range start (ISO 8601).
 * @param endIso Range end (ISO 8601).
 * @returns Events within the half-open interval.
 */
export function filterEventsInRange(
  events: readonly RawEvent[],
  startIso: string,
  endIso: string
): RawEvent[] {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  return events.filter((e) => {
    const t = new Date(e.timestamp).getTime();
    return t >= startMs && t < endMs;
  });
}
