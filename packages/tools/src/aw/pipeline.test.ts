import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveActivityRange } from "./intent.ts";
import { buildActivitySummary } from "./build-summary.ts";
import { formatActivityContext } from "./format.ts";
import type { Bucket, RawEvent } from "./types.ts";

const mockBuckets: Bucket[] = [
  { id: "aw-watcher-window_testhost", hostname: "testhost" },
  { id: "aw-watcher-web-chrome", hostname: "testhost" },
  { id: "aw-watcher-afk_testhost", hostname: "testhost" },
];

const mockEvents: Record<string, RawEvent[]> = {
  "aw-watcher-window_testhost": [
    {
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      duration: 1800,
      data: { app: "VS Code", title: "project/src/index.ts" },
    },
    {
      timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      duration: 1200,
      data: { app: "Terminal", title: "npm run test" },
    },
    {
      timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      duration: 900,
      data: { app: "Chrome", title: "GitHub - Pull Request #42" },
    },
  ],
  "aw-watcher-web-chrome": [
    {
      timestamp: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      duration: 600,
      data: { url: "https://github.com/mieweb/jerry/pull/42", title: "PR #42" },
    },
    {
      timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      duration: 300,
      data: {
        url: "https://docs.google.com/document/d/xyz",
        title: "Design Doc",
      },
    },
    {
      timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      duration: 1200,
      data: { url: "https://meet.google.com/abc-def-ghi", title: "Team Sync" },
    },
  ],
  "aw-watcher-afk_testhost": [
    {
      timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      duration: 60,
      data: { status: "not-afk" },
    },
  ],
};

const mockPages: Record<string, number> = {
  "aw-watcher-window_testhost": 1,
  "aw-watcher-web-chrome": 1,
  "aw-watcher-afk_testhost": 1,
};

describe("AW Pipeline: resolveActivityRange → buildActivitySummary → formatActivityContext", () => {
  it("processes 'last 4 hours' end-to-end", () => {
    const range = resolveActivityRange("last 4 hours");
    assert.ok(range.label.includes("4 hours"));

    const summary = buildActivitySummary(
      mockBuckets,
      mockEvents,
      mockPages,
      range
    );
    assert.equal(summary.connected, true);
    assert.ok(summary.bucketCount > 0);

    const context = formatActivityContext(summary);
    assert.ok(context.includes("## ActivityWatch data"));
    assert.ok(typeof context === "string");
    assert.ok(context.length > 100);
  });

  it("includes top activities from window watcher", () => {
    const range = resolveActivityRange("last 4 hours");
    const summary = buildActivitySummary(
      mockBuckets,
      mockEvents,
      mockPages,
      range
    );

    assert.ok(summary.topActivities.length > 0);

    const vsCodeActivity = summary.topActivities.find(
      (a) => a.app === "VS Code"
    );
    assert.ok(vsCodeActivity);
    assert.equal(vsCodeActivity.watcher, "window");
  });

  it("includes work-related web links", () => {
    const range = resolveActivityRange("last 4 hours");
    const summary = buildActivitySummary(
      mockBuckets,
      mockEvents,
      mockPages,
      range
    );

    assert.ok(summary.topWebLinks.length > 0);

    const githubLink = summary.topWebLinks.find((l) =>
      l.url.includes("github.com")
    );
    assert.ok(githubLink);
  });

  it("detects meeting sessions", () => {
    const range = resolveActivityRange("last 4 hours");
    const summary = buildActivitySummary(
      mockBuckets,
      mockEvents,
      mockPages,
      range
    );

    assert.ok(summary.meetingSessions.length > 0);

    const meetSession = summary.meetingSessions.find(
      (s) => s.platform === "google-meet"
    );
    assert.ok(meetSession);
    assert.equal(meetSession.meetingCode, "abc-def-ghi");
  });

  it("captures AFK status", () => {
    const range = resolveActivityRange("last 4 hours");
    const summary = buildActivitySummary(
      mockBuckets,
      mockEvents,
      mockPages,
      range
    );

    assert.ok(summary.afk);
    assert.equal(summary.afk.status, "not-afk");
  });

  it("formats context as markdown", () => {
    const range = resolveActivityRange("last 4 hours");
    const summary = buildActivitySummary(
      mockBuckets,
      mockEvents,
      mockPages,
      range
    );
    const context = formatActivityContext(summary);

    assert.ok(context.startsWith("## "));
    assert.ok(context.includes("### "));
    assert.ok(context.includes("- ["));
  });

  it("handles 'yesterday' range", () => {
    const range = resolveActivityRange("yesterday");
    assert.ok(range.label.includes("Yesterday"));
    assert.ok(range.end <= new Date());
  });

  it("handles 'today' range", () => {
    const range = resolveActivityRange("today");
    assert.ok(range.label.includes("Today"));

    const summary = buildActivitySummary(mockBuckets, {}, {}, range);
    assert.equal(summary.connected, true);
  });

  it("falls back gracefully in non-strict mode", () => {
    const range = resolveActivityRange("random prompt", undefined, undefined, {
      strict: false,
    });
    assert.ok(range.label.includes("Today"));
  });

  it("reports total event count correctly", () => {
    const range = resolveActivityRange("last 4 hours");
    const summary = buildActivitySummary(
      mockBuckets,
      mockEvents,
      mockPages,
      range
    );

    const expectedTotal = Object.values(summary.eventCounts).reduce(
      (sum, n) => sum + (n ?? 0),
      0
    );
    assert.equal(summary.totalEventCount, expectedTotal);
  });

  it("reports API call count correctly", () => {
    const range = resolveActivityRange("last 4 hours");
    const summary = buildActivitySummary(
      mockBuckets,
      mockEvents,
      mockPages,
      range
    );

    assert.ok(summary.totalApiCalls >= 0);
  });
});

describe("Pipeline with empty data", () => {
  it("handles empty buckets gracefully", () => {
    const range = resolveActivityRange("last 4 hours");
    const summary = buildActivitySummary([], {}, {}, range);

    assert.equal(summary.connected, true);
    assert.equal(summary.bucketCount, 0);
    assert.equal(summary.totalEventCount, 0);

    const context = formatActivityContext(summary);
    assert.ok(context.includes("No ActivityWatch events"));
  });

  it("handles buckets with no events", () => {
    const range = resolveActivityRange("last 4 hours");
    const summary = buildActivitySummary(mockBuckets, {}, {}, range);

    assert.equal(summary.connected, true);
    assert.equal(summary.totalEventCount, 0);
    assert.equal(summary.topActivities.length, 0);
    assert.equal(summary.topWebLinks.length, 0);
    assert.equal(summary.meetingSessions.length, 0);
  });
});
