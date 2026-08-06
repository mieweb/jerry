import type {
  MeetingPlatform,
  MeetingSession,
  RawEvent,
  TopActivity,
  WatcherKind,
  WebLinkActivity,
} from "./types.ts";

const TOP_ACTIVITIES_LIMIT = 20;
const TOP_WEB_LINKS_LIMIT = 25;

const WORK_HOST_SUFFIXES = [
  "github.com",
  "gitlab.com",
  "stackoverflow.com",
  "stackexchange.com",
  "notion.so",
  "notion.site",
  "linear.app",
  "figma.com",
  "atlassian.net",
  "npmjs.com",
  "pypi.org",
  "readthedocs.io",
  "vercel.app",
  "netlify.app",
  "docs.google.com",
  "drive.google.com",
  "slack.com",
  "app.slack.com",
];

function hostMatchesWorkSuffix(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "github.io" || host.endsWith(".github.io")) {
    return true;
  }
  return WORK_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
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

function activityKey(watcher: WatcherKind, app: string, title: string): string {
  return `${watcher}\0${app}\0${title}`;
}

/**
 * Aggregate top app/title pairs by tracked duration for one watcher.
 *
 * @param events Filtered events for a single bucket.
 * @param watcher Watcher kind (window, web, vscode, afk).
 * @param limit Maximum activities to return (default 20).
 * @returns Activities sorted by duration descending.
 */
export function aggregateTopActivities(
  events: readonly RawEvent[],
  watcher: WatcherKind,
  limit: number = TOP_ACTIVITIES_LIMIT
): TopActivity[] {
  const totals = new Map<string, TopActivity>();

  for (const event of events) {
    const { app, title } = labelFromEvent(event, watcher);
    const key = activityKey(watcher, app, title);
    const durationSeconds = Math.max(0, event.duration ?? 0);
    const existing = totals.get(key);
    if (existing) {
      existing.durationSeconds += durationSeconds;
      existing.eventCount += 1;
    } else {
      totals.set(key, {
        watcher,
        app,
        title,
        durationSeconds,
        eventCount: 1,
      });
    }
  }

  return [...totals.values()]
    .sort((a, b) => b.durationSeconds - a.durationSeconds)
    .slice(0, limit);
}

/**
 * Merge per-watcher top activities into a single ranked list.
 *
 * @param perWatcher Activities from multiple aggregateTopActivities calls.
 * @param limit Maximum activities to return (default 20).
 */
export function mergeTopActivities(
  perWatcher: TopActivity[],
  limit: number = TOP_ACTIVITIES_LIMIT
): TopActivity[] {
  return [...perWatcher]
    .sort((a, b) => b.durationSeconds - a.durationSeconds)
    .slice(0, limit);
}

function normalizeWebUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function pageTitleFromWebEvent(e: RawEvent, url: string): string {
  const data = e.data ?? {};
  const title = typeof data.title === "string" ? data.title.trim() : "";
  if (title && title !== url) {
    return title;
  }
  try {
    const { hostname, pathname } = new URL(url);
    const path = pathname === "/" ? "" : pathname;
    return `${hostname}${path}`;
  } catch {
    return url;
  }
}

/**
 * Whether a URL hostname is considered work-related (GitHub, docs, Slack, etc.).
 *
 * @param url HTTP(S) URL from web watcher events.
 */
export function isWorkRelatedUrl(url: string): boolean {
  try {
    return hostMatchesWorkSuffix(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Aggregate work-related web links by tracked duration.
 *
 * @param events Web watcher events in the resolved time range.
 * @param limit Maximum links to return (default 25).
 */
export function aggregateTopWebLinks(
  events: readonly RawEvent[],
  limit: number = TOP_WEB_LINKS_LIMIT
): WebLinkActivity[] {
  const totals = new Map<string, WebLinkActivity>();

  for (const event of events) {
    const rawUrl = event.data?.url;
    if (typeof rawUrl !== "string" || !rawUrl.startsWith("http")) {
      continue;
    }
    const url = normalizeWebUrl(rawUrl);
    if (!isWorkRelatedUrl(url)) {
      continue;
    }

    const durationSeconds = Math.max(0, event.duration ?? 0);
    const title = pageTitleFromWebEvent(event, url);
    const existing = totals.get(url);
    if (existing) {
      existing.durationSeconds += durationSeconds;
      existing.eventCount += 1;
      if (title.length > existing.title.length && title !== url) {
        existing.title = title;
      }
    } else {
      totals.set(url, {
        url,
        title,
        durationSeconds,
        eventCount: 1,
      });
    }
  }

  return [...totals.values()]
    .sort((a, b) => b.durationSeconds - a.durationSeconds)
    .slice(0, limit);
}

const MEETING_GAP_MS = 10 * 60 * 1000;
const MEETING_SESSION_LIMIT = 12;

type MeetingHostRule = { host: string; platform: MeetingPlatform };

const MEETING_HOSTS: MeetingHostRule[] = [
  { host: "meet.google.com", platform: "google-meet" },
  { host: "zoom.us", platform: "zoom" },
  { host: "teams.microsoft.com", platform: "teams" },
  { host: "teams.live.com", platform: "teams" },
];

function meetingPlatformFromUrl(url: string): MeetingPlatform | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const rule = MEETING_HOSTS.find(
      (r) => host === r.host || host.endsWith(`.${r.host}`)
    );
    return rule?.platform ?? null;
  } catch {
    return null;
  }
}

function meetingSessionKey(url: string, platform: MeetingPlatform): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if (platform === "google-meet") {
      const parts = parsed.pathname.split("/").filter(Boolean);
      if (parts.length > 0) {
        return `google-meet:${parts[parts.length - 1]}`;
      }
    }
    if (platform === "zoom") {
      return `zoom:${parsed.pathname}`;
    }
    return `${platform}:${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function meetingCodeFromUrl(
  url: string,
  platform: MeetingPlatform
): string | undefined {
  try {
    const parsed = new URL(url);
    if (platform === "google-meet") {
      const parts = parsed.pathname.split("/").filter(Boolean);
      const code = parts[parts.length - 1];
      return code && code.length > 2 ? code : undefined;
    }
    if (platform === "zoom") {
      const m = parsed.pathname.match(/\/j\/(\d+)/);
      return m?.[1];
    }
  } catch {
    return undefined;
  }
  return undefined;
}

type MeetingEventSlice = {
  platform: MeetingPlatform;
  url: string;
  title: string;
  startMs: number;
  endMs: number;
};

/**
 * Detect and merge contiguous video meeting sessions from web events.
 *
 * Supports Google Meet, Zoom, and Microsoft Teams URLs.
 *
 * @param events Web watcher events in the resolved time range.
 * @param limit Maximum sessions to return.
 */
export function aggregateMeetingSessions(
  events: readonly RawEvent[],
  limit: number = MEETING_SESSION_LIMIT
): MeetingSession[] {
  const slices: MeetingEventSlice[] = [];

  for (const event of events) {
    const rawUrl = event.data?.url;
    if (typeof rawUrl !== "string" || !rawUrl.startsWith("http")) {
      continue;
    }
    const platform = meetingPlatformFromUrl(rawUrl);
    if (!platform) continue;

    const url = normalizeWebUrl(rawUrl);
    const startMs = new Date(event.timestamp).getTime();
    const durationMs = Math.max(0, (event.duration ?? 0) * 1000);
    const endMs = startMs + durationMs;

    slices.push({
      platform,
      url,
      title: pageTitleFromWebEvent(event, url),
      startMs,
      endMs: durationMs > 0 ? endMs : startMs + 60_000,
    });
  }

  slices.sort((a, b) => a.startMs - b.startMs);

  const byKey = new Map<string, MeetingEventSlice[][]>();

  for (const slice of slices) {
    const key = meetingSessionKey(slice.url, slice.platform);
    const groups = byKey.get(key) ?? [];
    const lastGroup = groups[groups.length - 1];
    const lastSlice = lastGroup?.[lastGroup.length - 1];

    if (
      !lastGroup ||
      !lastSlice ||
      slice.startMs - lastSlice.endMs > MEETING_GAP_MS
    ) {
      groups.push([slice]);
      byKey.set(key, groups);
    } else {
      lastGroup.push(slice);
    }
  }

  const sessions: MeetingSession[] = [];

  for (const groups of byKey.values()) {
    for (const group of groups) {
      const startMs = group[0].startMs;
      const endMs = Math.max(...group.map((g) => g.endMs));
      const url = group[0].url;
      const platform = group[0].platform;
      const title =
        group
          .map((g) => g.title)
          .filter((t) => t && !t.startsWith("http"))
          .sort((a, b) => b.length - a.length)[0] ?? group[0].title;

      sessions.push({
        platform,
        url,
        meetingCode: meetingCodeFromUrl(url, platform),
        title,
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
        durationSeconds: Math.max(1, Math.round((endMs - startMs) / 1000)),
        eventCount: group.length,
      });
    }
  }

  return sessions
    .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
    .slice(0, limit);
}
