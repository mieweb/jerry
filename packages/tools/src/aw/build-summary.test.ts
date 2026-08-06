import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildActivitySummary,
  pickBucket,
  watcherFromBucketId,
} from "./build-summary.ts";
import type { ActivityTimeRange, Bucket, RawEvent } from "./types.ts";

describe("watcherFromBucketId", () => {
  it("detects window watcher", () => {
    assert.equal(watcherFromBucketId("aw-watcher-window_hostname"), "window");
  });

  it("detects web watcher", () => {
    assert.equal(watcherFromBucketId("aw-watcher-web-chrome"), "web");
  });

  it("detects vscode watcher", () => {
    assert.equal(watcherFromBucketId("aw-watcher-vscode"), "vscode");
  });

  it("detects afk watcher", () => {
    assert.equal(watcherFromBucketId("aw-watcher-afk_hostname"), "afk");
  });

  it("returns other for unknown bucket", () => {
    assert.equal(watcherFromBucketId("custom-bucket"), "other");
  });

  it("is case-insensitive", () => {
    assert.equal(watcherFromBucketId("AW-WATCHER-WINDOW_HOST"), "window");
  });
});

describe("pickBucket", () => {
  const buckets: Bucket[] = [
    { id: "aw-watcher-window_host1", hostname: "host1" },
    { id: "aw-watcher-window_host2", hostname: "host2" },
    { id: "aw-watcher-web-chrome", hostname: "host1" },
    { id: "aw-watcher-afk_host1", hostname: "host1" },
  ];

  it("returns first matching bucket for watcher", () => {
    const result = pickBucket(buckets, "window");
    assert.ok(result);
    assert.ok(result.id.includes("window"));
  });

  it("prefers bucket matching hostname", () => {
    const result = pickBucket(buckets, "window", "host2");
    assert.ok(result);
    assert.ok(result.id.includes("host2"));
  });

  it("returns undefined when no match", () => {
    const result = pickBucket(buckets, "vscode");
    assert.equal(result, undefined);
  });

  it("returns first match when hostname not found", () => {
    const result = pickBucket(buckets, "window", "host3");
    assert.ok(result);
    assert.equal(result.id, "aw-watcher-window_host1");
  });
});

describe("buildActivitySummary", () => {
  const buckets: Bucket[] = [
    { id: "aw-watcher-window_host1", hostname: "host1" },
    { id: "aw-watcher-web-chrome", hostname: "host1" },
    { id: "aw-watcher-afk_host1", hostname: "host1" },
  ];

  const range: ActivityTimeRange = {
    start: new Date("2024-01-15T09:00:00Z"),
    end: new Date("2024-01-15T17:00:00Z"),
    label: "Test Range",
  };

  it("returns connected: true", () => {
    const result = buildActivitySummary(buckets, {}, {}, range);
    assert.equal(result.connected, true);
  });

  it("includes bucket count", () => {
    const result = buildActivitySummary(buckets, {}, {}, range);
    assert.equal(result.bucketCount, 3);
  });

  it("calculates range hours", () => {
    const result = buildActivitySummary(buckets, {}, {}, range);
    assert.equal(result.rangeHours, 8);
  });

  it("includes range label", () => {
    const result = buildActivitySummary(buckets, {}, {}, range);
    assert.equal(result.rangeLabel, "Test Range");
  });

  it("aggregates events from buckets", () => {
    const events: Record<string, RawEvent[]> = {
      "aw-watcher-window_host1": [
        {
          timestamp: "2024-01-15T10:00:00Z",
          duration: 60,
          data: { app: "VS Code", title: "file.ts" },
        },
        {
          timestamp: "2024-01-15T11:00:00Z",
          duration: 120,
          data: { app: "Chrome", title: "GitHub" },
        },
      ],
    };
    const pages: Record<string, number> = {
      "aw-watcher-window_host1": 1,
    };

    const result = buildActivitySummary(buckets, events, pages, range);

    assert.ok(result.topActivities.length > 0);
    assert.equal(result.eventCounts.window, 2);
    assert.equal(result.totalEventCount, 2);
  });

  it("captures AFK status from afk watcher", () => {
    const events: Record<string, RawEvent[]> = {
      "aw-watcher-afk_host1": [
        {
          timestamp: "2024-01-15T10:00:00Z",
          duration: 60,
          data: { status: "not-afk" },
        },
      ],
    };

    const result = buildActivitySummary(buckets, events, {}, range);

    assert.ok(result.afk);
    assert.equal(result.afk.status, "not-afk");
  });

  it("includes latest events per watcher", () => {
    const events: Record<string, RawEvent[]> = {
      "aw-watcher-window_host1": [
        {
          timestamp: "2024-01-15T10:00:00Z",
          duration: 60,
          data: { app: "App1", title: "Title1" },
        },
        {
          timestamp: "2024-01-15T11:00:00Z",
          duration: 60,
          data: { app: "App2", title: "Title2" },
        },
      ],
    };

    const result = buildActivitySummary(buckets, events, {}, range);

    assert.ok(result.latest.length > 0);
    const windowLatest = result.latest.find((l) => l.watcher === "window");
    assert.ok(windowLatest);
    assert.equal(windowLatest.app, "App2");
  });

  it("filters events to range", () => {
    const events: Record<string, RawEvent[]> = {
      "aw-watcher-window_host1": [
        {
          timestamp: "2024-01-14T10:00:00Z",
          duration: 60,
          data: { app: "Outside", title: "Range" },
        },
        {
          timestamp: "2024-01-15T10:00:00Z",
          duration: 60,
          data: { app: "Inside", title: "Range" },
        },
      ],
    };

    const result = buildActivitySummary(buckets, events, {}, range);

    assert.equal(result.eventCounts.window, 1);
  });

  it("respects hostname option", () => {
    const multiBuckets: Bucket[] = [
      { id: "aw-watcher-window_host1", hostname: "host1" },
      { id: "aw-watcher-window_host2", hostname: "host2" },
    ];
    const events: Record<string, RawEvent[]> = {
      "aw-watcher-window_host1": [
        {
          timestamp: "2024-01-15T10:00:00Z",
          duration: 60,
          data: { app: "Host1App", title: "Title" },
        },
      ],
      "aw-watcher-window_host2": [
        {
          timestamp: "2024-01-15T10:00:00Z",
          duration: 120,
          data: { app: "Host2App", title: "Title" },
        },
      ],
    };

    const result = buildActivitySummary(multiBuckets, events, {}, range, {
      hostname: "host2",
    });

    const windowActivity = result.topActivities.find(
      (a) => a.watcher === "window"
    );
    assert.ok(windowActivity);
    assert.equal(windowActivity.app, "Host2App");
  });
});
