import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import {
  discoverActivityBuckets,
  fetchAwActivityRange,
  fetchBucketEventsInRange,
  isActivityBucket,
  isAwReachable,
  resolveAwUrl,
} from "./client.ts";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe("resolveAwUrl", () => {
  it("strips a trailing slash", () => {
    assert.equal(resolveAwUrl("http://localhost:5600/"), "http://localhost:5600");
  });

  it("falls back to the default", () => {
    const prev = process.env.AW_URL;
    delete process.env.AW_URL;
    try {
      assert.equal(resolveAwUrl(), "http://localhost:5600");
    } finally {
      if (prev !== undefined) process.env.AW_URL = prev;
    }
  });
});

describe("isActivityBucket", () => {
  it("accepts window and web watchers", () => {
    assert.equal(isActivityBucket({ id: "a", type: "currentwindow" }, "a"), true);
    assert.equal(isActivityBucket({ id: "b", type: "web.tab.current" }, "b"), true);
    assert.equal(
      isActivityBucket({ id: "aw-watcher-window_host" }, "aw-watcher-window_host"),
      true
    );
  });

  it("rejects unrelated buckets", () => {
    assert.equal(isActivityBucket({ id: "aw-watcher-afk", type: "afkstatus" }, "aw-watcher-afk"), false);
  });
});

describe("fetchAwActivityRange", () => {
  it("returns null when ActivityWatch is unreachable", async () => {
    const fetchImpl = mock.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    const slice = await fetchAwActivityRange({
      start: new Date("2026-06-26T00:00:00Z"),
      end: new Date("2026-06-27T00:00:00Z"),
      fetchImpl,
    });

    assert.equal(slice, null);
  });

  it("fetches the exact range from matching buckets", async () => {
    const fetchImpl = mock.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/api/0/info")) {
        return jsonResponse({ hostname: "test" });
      }

      if (url.endsWith("/api/0/buckets/")) {
        return jsonResponse({
          "aw-watcher-window_test": {
            id: "aw-watcher-window_test",
            type: "currentwindow",
          },
          "aw-watcher-afk_test": {
            id: "aw-watcher-afk_test",
            type: "afkstatus",
          },
        });
      }

      if (url.includes("/events?")) {
        assert.match(url, /start=2026-06-26T00%3A00%3A00\.000Z/);
        assert.match(url, /end=2026-06-27T00%3A00%3A00\.000Z/);
        assert.match(url, /limit=-1/);
        return jsonResponse([
          {
            timestamp: "2026-06-26T12:00:00.000Z",
            duration: 120,
            data: { app: "Cursor", title: "cli.md" },
          },
        ]);
      }

      return jsonResponse({}, false, 404);
    }) as unknown as typeof fetch;

    const slice = await fetchAwActivityRange({
      start: new Date("2026-06-26T00:00:00.000Z"),
      end: new Date("2026-06-27T00:00:00.000Z"),
      fetchImpl,
    });

    assert.ok(slice);
    assert.equal(slice.eventCount, 1);
    assert.equal(slice.buckets.length, 1);
    assert.equal(slice.buckets[0].id, "aw-watcher-window_test");
    assert.equal(
      slice.eventsByBucket["aw-watcher-window_test"][0].data.app,
      "Cursor"
    );
  });

  it("returns an empty slice when AW is up but has no events", async () => {
    const fetchImpl = mock.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/0/info")) return jsonResponse({});
      if (url.endsWith("/api/0/buckets/")) {
        return jsonResponse({
          "aw-watcher-window_test": {
            id: "aw-watcher-window_test",
            type: "currentwindow",
          },
        });
      }
      return jsonResponse([]);
    }) as unknown as typeof fetch;

    const slice = await fetchAwActivityRange({
      start: new Date("2026-07-22T00:00:00Z"),
      end: new Date("2026-07-23T00:00:00Z"),
      fetchImpl,
    });

    assert.ok(slice);
    assert.equal(slice.eventCount, 0);
  });
});

describe("discoverActivityBuckets / fetchBucketEventsInRange", () => {
  it("filters to activity buckets only", async () => {
    const fetchImpl = mock.fn(async () =>
      jsonResponse({
        window: { id: "window", type: "currentwindow" },
        afk: { id: "afk", type: "afkstatus" },
      })
    ) as unknown as typeof fetch;

    const buckets = await discoverActivityBuckets("http://aw", fetchImpl);
    assert.deepEqual(
      buckets.map((b) => b.id),
      ["window"]
    );
  });

  it("returns [] on fetch failure", async () => {
    const events = await fetchBucketEventsInRange(
      "http://aw",
      "bucket",
      new Date(),
      new Date(),
      mock.fn(async () => {
        throw new Error("down");
      }) as unknown as typeof fetch
    );
    assert.deepEqual(events, []);
  });
});

describe("isAwReachable", () => {
  it("is true when /api/0/info succeeds", async () => {
    const ok = await isAwReachable(
      "http://aw",
      mock.fn(async () => jsonResponse({})) as unknown as typeof fetch
    );
    assert.equal(ok, true);
  });
});
