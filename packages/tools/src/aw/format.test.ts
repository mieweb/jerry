import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatActivityContext } from "./format.ts";
import type { AwActivitySummary } from "./types.ts";

function makeSummary(
  overrides: Partial<AwActivitySummary> = {}
): AwActivitySummary {
  return {
    connected: true,
    bucketCount: 3,
    rangeHours: 4,
    rangeLabel: "Last 4 hours",
    range: { start: "2024-01-15T10:00:00Z", end: "2024-01-15T14:00:00Z" },
    afk: null,
    latest: [],
    topActivities: [],
    topWebLinks: [],
    meetingSessions: [],
    eventCounts: {},
    eventFetchPages: {},
    totalEventCount: 0,
    totalApiCalls: 0,
    ...overrides,
  };
}

describe("formatActivityContext", () => {
  it("includes header and range info", () => {
    const summary = makeSummary();
    const result = formatActivityContext(summary);

    assert.ok(result.includes("## ActivityWatch data"));
    assert.ok(result.includes("Last 4 hours"));
    assert.ok(result.includes("4.00h"));
  });

  it("includes AFK status when present", () => {
    const summary = makeSummary({
      afk: { status: "not-afk", timestamp: "2024-01-15T13:00:00Z" },
    });
    const result = formatActivityContext(summary);

    assert.ok(result.includes("AFK status"));
    assert.ok(result.includes("not-afk"));
  });

  it("includes meeting sessions", () => {
    const summary = makeSummary({
      meetingSessions: [
        {
          platform: "google-meet",
          url: "https://meet.google.com/abc-def-ghi",
          meetingCode: "abc-def-ghi",
          title: "Team Standup",
          start: "2024-01-15T10:00:00Z",
          end: "2024-01-15T10:30:00Z",
          durationSeconds: 1800,
          eventCount: 5,
        },
      ],
    });
    const result = formatActivityContext(summary);

    assert.ok(result.includes("### Video meetings"));
    assert.ok(result.includes("google-meet"));
    assert.ok(result.includes("Team Standup"));
    assert.ok(result.includes("abc-def-ghi"));
  });

  it("includes top activities", () => {
    const summary = makeSummary({
      totalEventCount: 10,
      topActivities: [
        {
          watcher: "window",
          app: "VS Code",
          title: "index.ts",
          durationSeconds: 3600,
          eventCount: 5,
        },
        {
          watcher: "web",
          app: "Chrome",
          title: "GitHub",
          durationSeconds: 1800,
          eventCount: 3,
        },
      ],
    });
    const result = formatActivityContext(summary);

    assert.ok(result.includes("### Top activities"));
    assert.ok(result.includes("VS Code"));
    assert.ok(result.includes("index.ts"));
    assert.ok(result.includes("1h"));
  });

  it("includes web links", () => {
    const summary = makeSummary({
      topWebLinks: [
        {
          url: "https://github.com/mieweb/jerry",
          title: "Jerry Repository",
          durationSeconds: 1800,
          eventCount: 5,
        },
      ],
    });
    const result = formatActivityContext(summary);

    assert.ok(result.includes("### Work-related web links"));
    assert.ok(result.includes("Jerry Repository"));
    assert.ok(result.includes("https://github.com/mieweb/jerry"));
  });

  it("includes latest snapshot per watcher", () => {
    const summary = makeSummary({
      latest: [
        {
          watcher: "window",
          bucketId: "aw-watcher-window_host",
          app: "VS Code",
          title: "main.ts",
          timestamp: "2024-01-15T13:55:00Z",
        },
      ],
    });
    const result = formatActivityContext(summary);

    assert.ok(result.includes("### Latest snapshot"));
    assert.ok(result.includes("VS Code"));
    assert.ok(result.includes("main.ts"));
  });

  it("shows no events message when totalEventCount is 0", () => {
    const summary = makeSummary({ totalEventCount: 0 });
    const result = formatActivityContext(summary);

    assert.ok(result.includes("No ActivityWatch events were recorded"));
  });

  it("includes usage instructions at the end", () => {
    const summary = makeSummary();
    const result = formatActivityContext(summary);

    assert.ok(result.includes("Use only the data above"));
  });

  it("formats event counts per watcher", () => {
    const summary = makeSummary({
      eventCounts: { window: 50, web: 30, afk: 10 },
      totalEventCount: 90,
    });
    const result = formatActivityContext(summary);

    assert.ok(result.includes("window: 50"));
    assert.ok(result.includes("web: 30"));
    assert.ok(result.includes("afk: 10"));
  });

  it("formats duration correctly", () => {
    const summary = makeSummary({
      totalEventCount: 1,
      topActivities: [
        {
          watcher: "window",
          app: "App",
          title: "",
          durationSeconds: 7380,
          eventCount: 1,
        },
      ],
    });
    const result = formatActivityContext(summary);

    assert.ok(result.includes("2h 3m"));
  });
});
