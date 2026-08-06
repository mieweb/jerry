import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateMeetingSessions,
  aggregateTopActivities,
  aggregateTopWebLinks,
  isWorkRelatedUrl,
  mergeTopActivities,
} from "./aggregate.ts";
import type { RawEvent } from "./types.ts";

const makeWindowEvent = (
  app: string,
  title: string,
  duration: number,
  timestamp = "2024-01-15T10:00:00Z"
): RawEvent => ({
  timestamp,
  duration,
  data: { app, title },
});

const makeWebEvent = (
  url: string,
  title: string,
  duration: number,
  timestamp = "2024-01-15T10:00:00Z"
): RawEvent => ({
  timestamp,
  duration,
  data: { url, title },
});

describe("isWorkRelatedUrl", () => {
  it("returns true for github.com", () => {
    assert.equal(isWorkRelatedUrl("https://github.com/mieweb/jerry"), true);
  });

  it("returns true for gitlab.com", () => {
    assert.equal(isWorkRelatedUrl("https://gitlab.com/project"), true);
  });

  it("returns true for github.io pages", () => {
    assert.equal(isWorkRelatedUrl("https://username.github.io/docs"), true);
  });

  it("returns true for docs.google.com", () => {
    assert.equal(isWorkRelatedUrl("https://docs.google.com/document/d/xyz"), true);
  });

  it("returns true for slack.com", () => {
    assert.equal(isWorkRelatedUrl("https://app.slack.com/client/T123"), true);
  });

  it("returns true for linear.app", () => {
    assert.equal(isWorkRelatedUrl("https://linear.app/mieweb/issue/JER-1"), true);
  });

  it("returns false for youtube.com", () => {
    assert.equal(isWorkRelatedUrl("https://youtube.com/watch?v=xyz"), false);
  });

  it("returns false for twitter.com", () => {
    assert.equal(isWorkRelatedUrl("https://twitter.com/user"), false);
  });

  it("returns false for invalid URLs", () => {
    assert.equal(isWorkRelatedUrl("not-a-url"), false);
  });
});

describe("aggregateTopActivities", () => {
  it("aggregates events by app/title", () => {
    const events: RawEvent[] = [
      makeWindowEvent("VS Code", "file.ts", 120),
      makeWindowEvent("VS Code", "file.ts", 60),
      makeWindowEvent("Chrome", "GitHub", 30),
    ];

    const result = aggregateTopActivities(events, "window");

    assert.equal(result.length, 2);
    assert.equal(result[0].app, "VS Code");
    assert.equal(result[0].title, "file.ts");
    assert.equal(result[0].durationSeconds, 180);
    assert.equal(result[0].eventCount, 2);
  });

  it("sorts by duration descending", () => {
    const events: RawEvent[] = [
      makeWindowEvent("App A", "short", 10),
      makeWindowEvent("App B", "long", 100),
    ];

    const result = aggregateTopActivities(events, "window");

    assert.equal(result[0].app, "App B");
    assert.equal(result[1].app, "App A");
  });

  it("respects limit parameter", () => {
    const events: RawEvent[] = [
      makeWindowEvent("App 1", "title", 10),
      makeWindowEvent("App 2", "title", 20),
      makeWindowEvent("App 3", "title", 30),
    ];

    const result = aggregateTopActivities(events, "window", 2);

    assert.equal(result.length, 2);
  });

  it("handles afk watcher events", () => {
    const events: RawEvent[] = [
      { timestamp: "2024-01-15T10:00:00Z", duration: 60, data: { status: "not-afk" } },
    ];

    const result = aggregateTopActivities(events, "afk");

    assert.equal(result.length, 1);
    assert.equal(result[0].app, "afk");
    assert.equal(result[0].title, "not-afk");
  });
});

describe("mergeTopActivities", () => {
  it("merges and sorts activities from multiple watchers", () => {
    const activities = [
      { watcher: "window" as const, app: "A", title: "", durationSeconds: 50, eventCount: 1 },
      { watcher: "web" as const, app: "B", title: "", durationSeconds: 100, eventCount: 1 },
      { watcher: "vscode" as const, app: "C", title: "", durationSeconds: 75, eventCount: 1 },
    ];

    const result = mergeTopActivities(activities);

    assert.equal(result[0].app, "B");
    assert.equal(result[1].app, "C");
    assert.equal(result[2].app, "A");
  });

  it("respects limit parameter", () => {
    const activities = [
      { watcher: "window" as const, app: "A", title: "", durationSeconds: 50, eventCount: 1 },
      { watcher: "window" as const, app: "B", title: "", durationSeconds: 100, eventCount: 1 },
      { watcher: "window" as const, app: "C", title: "", durationSeconds: 75, eventCount: 1 },
    ];

    const result = mergeTopActivities(activities, 2);

    assert.equal(result.length, 2);
  });
});

describe("aggregateTopWebLinks", () => {
  it("aggregates work-related URLs", () => {
    const events: RawEvent[] = [
      makeWebEvent("https://github.com/mieweb/jerry", "Jerry - GitHub", 60),
      makeWebEvent("https://github.com/mieweb/jerry", "Jerry - GitHub", 30),
      makeWebEvent("https://youtube.com/watch", "Video", 120),
    ];

    const result = aggregateTopWebLinks(events);

    assert.equal(result.length, 1);
    assert.equal(result[0].url, "https://github.com/mieweb/jerry");
    assert.equal(result[0].durationSeconds, 90);
    assert.equal(result[0].eventCount, 2);
  });

  it("normalizes URLs by removing hash", () => {
    const events: RawEvent[] = [
      makeWebEvent("https://github.com/repo#section1", "Page", 60),
      makeWebEvent("https://github.com/repo#section2", "Page", 30),
    ];

    const result = aggregateTopWebLinks(events);

    assert.equal(result.length, 1);
    assert.equal(result[0].durationSeconds, 90);
  });

  it("filters out non-work URLs", () => {
    const events: RawEvent[] = [
      makeWebEvent("https://twitter.com/user", "Twitter", 60),
      makeWebEvent("https://facebook.com/page", "Facebook", 30),
    ];

    const result = aggregateTopWebLinks(events);

    assert.equal(result.length, 0);
  });

  it("respects limit parameter", () => {
    const events: RawEvent[] = [
      makeWebEvent("https://github.com/a", "A", 100),
      makeWebEvent("https://github.com/b", "B", 50),
      makeWebEvent("https://github.com/c", "C", 25),
    ];

    const result = aggregateTopWebLinks(events, 2);

    assert.equal(result.length, 2);
  });
});

describe("aggregateMeetingSessions", () => {
  it("detects Google Meet sessions", () => {
    const events: RawEvent[] = [
      makeWebEvent(
        "https://meet.google.com/abc-def-ghi",
        "Meeting",
        300,
        "2024-01-15T10:00:00Z"
      ),
    ];

    const result = aggregateMeetingSessions(events);

    assert.equal(result.length, 1);
    assert.equal(result[0].platform, "google-meet");
    assert.equal(result[0].meetingCode, "abc-def-ghi");
  });

  it("detects Zoom sessions", () => {
    const events: RawEvent[] = [
      makeWebEvent(
        "https://zoom.us/j/123456789",
        "Zoom Meeting",
        300,
        "2024-01-15T10:00:00Z"
      ),
    ];

    const result = aggregateMeetingSessions(events);

    assert.equal(result.length, 1);
    assert.equal(result[0].platform, "zoom");
    assert.equal(result[0].meetingCode, "123456789");
  });

  it("detects Teams sessions", () => {
    const events: RawEvent[] = [
      makeWebEvent(
        "https://teams.microsoft.com/meeting/abc",
        "Teams Call",
        300,
        "2024-01-15T10:00:00Z"
      ),
    ];

    const result = aggregateMeetingSessions(events);

    assert.equal(result.length, 1);
    assert.equal(result[0].platform, "teams");
  });

  it("merges contiguous meeting events", () => {
    const events: RawEvent[] = [
      makeWebEvent(
        "https://meet.google.com/abc-def-ghi",
        "Meeting",
        60,
        "2024-01-15T10:00:00Z"
      ),
      makeWebEvent(
        "https://meet.google.com/abc-def-ghi",
        "Meeting",
        60,
        "2024-01-15T10:01:00Z"
      ),
      makeWebEvent(
        "https://meet.google.com/abc-def-ghi",
        "Meeting",
        60,
        "2024-01-15T10:02:00Z"
      ),
    ];

    const result = aggregateMeetingSessions(events);

    assert.equal(result.length, 1);
    assert.equal(result[0].eventCount, 3);
  });

  it("splits non-contiguous sessions (>10min gap)", () => {
    const events: RawEvent[] = [
      makeWebEvent(
        "https://meet.google.com/abc-def-ghi",
        "Meeting",
        60,
        "2024-01-15T10:00:00Z"
      ),
      makeWebEvent(
        "https://meet.google.com/abc-def-ghi",
        "Meeting",
        60,
        "2024-01-15T10:20:00Z"
      ),
    ];

    const result = aggregateMeetingSessions(events);

    assert.equal(result.length, 2);
  });

  it("ignores non-meeting URLs", () => {
    const events: RawEvent[] = [
      makeWebEvent("https://github.com/repo", "GitHub", 300),
      makeWebEvent("https://slack.com/app", "Slack", 300),
    ];

    const result = aggregateMeetingSessions(events);

    assert.equal(result.length, 0);
  });
});
