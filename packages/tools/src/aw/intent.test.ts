import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mentionsFullHistory,
  mentionsYesterday,
  parseActivityRangeFromPrompt,
  resolveActivityRange,
  resolveRangeHours,
} from "./intent.ts";
import type { Bucket } from "./types.ts";

describe("mentionsYesterday", () => {
  it("returns true for 'yesterday'", () => {
    assert.equal(mentionsYesterday("yesterday"), true);
  });

  it("returns true for 'previous day'", () => {
    assert.equal(mentionsYesterday("previous day"), true);
  });

  it("returns true for 'prior day'", () => {
    assert.equal(mentionsYesterday("prior day"), true);
  });

  it("returns true for 'the day before'", () => {
    assert.equal(mentionsYesterday("the day before"), true);
  });

  it("returns true for 'last day' (not followed by number)", () => {
    assert.equal(mentionsYesterday("last day"), true);
  });

  it("returns false for 'last 2 days'", () => {
    assert.equal(mentionsYesterday("last 2 days"), false);
  });

  it("returns false for 'today'", () => {
    assert.equal(mentionsYesterday("today"), false);
  });
});

describe("mentionsFullHistory", () => {
  it("returns true for 'all time'", () => {
    assert.equal(mentionsFullHistory("all time"), true);
  });

  it("returns true for 'entire history'", () => {
    assert.equal(mentionsFullHistory("entire history"), true);
  });

  it("returns true for 'full activitywatch'", () => {
    assert.equal(mentionsFullHistory("full activitywatch"), true);
  });

  it("returns true for 'all my activity'", () => {
    assert.equal(mentionsFullHistory("all my activity"), true);
  });

  it("returns true for 'since i installed'", () => {
    assert.equal(mentionsFullHistory("since i installed"), true);
  });

  it("returns false for 'today'", () => {
    assert.equal(mentionsFullHistory("today"), false);
  });
});

describe("parseActivityRangeFromPrompt", () => {
  it("parses 'today'", () => {
    const result = parseActivityRangeFromPrompt("today");
    assert.ok(result);
    assert.ok(result.label.includes("Today"));
  });

  it("parses 'yesterday'", () => {
    const result = parseActivityRangeFromPrompt("yesterday");
    assert.ok(result);
    assert.ok(result.label.includes("Yesterday"));
  });

  it("parses 'last 2 hours'", () => {
    const result = parseActivityRangeFromPrompt("last 2 hours");
    assert.ok(result);
    assert.ok(result.label.includes("Last 2 hours"));
  });

  it("parses 'past 4 hours'", () => {
    const result = parseActivityRangeFromPrompt("past 4 hours");
    assert.ok(result);
    assert.ok(result.label.includes("Past 4 hours"));
  });

  it("parses 'last hour'", () => {
    const result = parseActivityRangeFromPrompt("last hour");
    assert.ok(result);
    assert.ok(result.label.includes("Last hour"));
  });

  it("parses 'this morning'", () => {
    const result = parseActivityRangeFromPrompt("this morning");
    assert.ok(result);
    assert.ok(result.label.includes("Today"));
  });

  it("returns null for unrecognized prompts", () => {
    const result = parseActivityRangeFromPrompt("random text");
    assert.equal(result, null);
  });

  it("parses calendar date 'June 15'", () => {
    const result = parseActivityRangeFromPrompt("June 15");
    assert.ok(result);
    assert.ok(result.label.includes("Jun"));
  });

  it("parses calendar range 'May 10 to May 13'", () => {
    const result = parseActivityRangeFromPrompt("May 10 to May 13");
    assert.ok(result);
    assert.ok(result.label.includes("May"));
  });

  it("parses ISO date '2024-06-15'", () => {
    const result = parseActivityRangeFromPrompt("2024-06-15");
    assert.ok(result);
  });

  it("parses ISO range '2024-06-10 to 2024-06-15'", () => {
    const result = parseActivityRangeFromPrompt("2024-06-10 to 2024-06-15");
    assert.ok(result);
  });
});

describe("resolveActivityRange", () => {
  it("uses hoursFlag when provided", () => {
    const result = resolveActivityRange("some text", 5);
    assert.ok(result.label.includes("5 hours"));
  });

  it("parses prompt when hoursFlag is undefined", () => {
    const result = resolveActivityRange("last 3 hours");
    assert.ok(result.label.includes("3 hours"));
  });

  it("throws in strict mode when no range found", () => {
    assert.throws(() => {
      resolveActivityRange("random text", undefined, undefined, { strict: true });
    }, /No time range/);
  });

  it("falls back to today in non-strict mode", () => {
    const result = resolveActivityRange("random text", undefined, undefined, {
      strict: false,
    });
    assert.ok(result.label.includes("Today"));
  });

  it("resolves full history when buckets provided", () => {
    const buckets: Bucket[] = [
      { id: "aw-watcher-window", created: "2024-01-01T00:00:00Z" },
    ];
    const result = resolveActivityRange("all time", undefined, buckets);
    assert.ok(result.label.includes("All ActivityWatch"));
  });
});

describe("resolveRangeHours", () => {
  it("returns hours for 'last 2 hours'", () => {
    const hours = resolveRangeHours("last 2 hours");
    assert.ok(hours > 1.9 && hours < 2.1);
  });

  it("returns hours for 'last 4 hours'", () => {
    const hours = resolveRangeHours("last 4 hours");
    assert.ok(hours > 3.9 && hours < 4.1);
  });

  it("uses hoursFlag when provided", () => {
    const hours = resolveRangeHours("some text", 8);
    assert.ok(hours > 7.9 && hours < 8.1);
  });
});
