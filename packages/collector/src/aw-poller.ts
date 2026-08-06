/**
 * ActivityWatch poller — polls localhost:5600 for activity events.
 *
 * Fetches events from configured buckets, tracks cursor (last event timestamp),
 * and pushes new events to Jerry.
 */

export interface AwPollerConfig {
  /** ActivityWatch API base URL (default: http://localhost:5600) */
  awUrl?: string;
  /** Jerry API base URL (default: http://127.0.0.1:8787) */
  jerryUrl?: string;
  /** Poll interval in milliseconds (default: 30000) */
  pollInterval?: number;
  /** Buckets to poll (default: window and web watchers) */
  buckets?: string[];
}

interface AwEvent {
  id?: number;
  timestamp: string;
  duration: number;
  data: Record<string, unknown>;
}

interface AwBucket {
  id: string;
  name?: string;
  type: string;
  client: string;
  hostname: string;
  created: string;
  last_updated?: string;
}

const DEFAULT_CONFIG: Required<AwPollerConfig> = {
  awUrl: "http://localhost:5600",
  jerryUrl: "http://127.0.0.1:8787",
  pollInterval: 30000,
  buckets: [],
};

/**
 * Discover available AW buckets matching our target watcher types.
 */
async function discoverBuckets(awUrl: string): Promise<string[]> {
  try {
    const response = await fetch(`${awUrl}/api/0/buckets`);
    if (!response.ok) {
      console.error(`Failed to fetch buckets: ${response.status}`);
      return [];
    }

    const data = await response.json() as Record<string, AwBucket>;
    const buckets: string[] = [];

    for (const [id, bucket] of Object.entries(data)) {
      // Look for window and web watchers
      if (
        bucket.type === "currentwindow" ||
        bucket.type === "web.tab.current" ||
        id.includes("aw-watcher-window") ||
        id.includes("aw-watcher-web")
      ) {
        buckets.push(id);
      }
    }

    return buckets;
  } catch (err) {
    console.error(`Error discovering buckets: ${err}`);
    return [];
  }
}

/**
 * Fetch events from an AW bucket since a given timestamp.
 */
async function fetchBucketEvents(
  awUrl: string,
  bucketId: string,
  since?: string
): Promise<AwEvent[]> {
  try {
    let url = `${awUrl}/api/0/buckets/${encodeURIComponent(bucketId)}/events`;

    if (since) {
      // AW expects ISO format; fetch events after this timestamp
      url += `?start=${encodeURIComponent(since)}`;
    } else {
      // First poll: get last 2 hours
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      url += `?start=${encodeURIComponent(twoHoursAgo)}`;
    }

    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch events from ${bucketId}: ${response.status}`);
      return [];
    }

    return (await response.json()) as AwEvent[];
  } catch (err) {
    console.error(`Error fetching events from ${bucketId}: ${err}`);
    return [];
  }
}

/**
 * Push events to Jerry.
 */
async function pushToJerry(
  jerryUrl: string,
  bucketId: string,
  events: AwEvent[]
): Promise<boolean> {
  if (events.length === 0) return true;

  try {
    const payload = events.map((event) => ({
      source: "aw",
      occurredAt: event.timestamp,
      payload: {
        bucketId,
        events: [event],
      },
    }));

    const response = await fetch(`${jerryUrl}/v1/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`Failed to push events: ${response.status}`);
      return false;
    }

    const result = await response.json() as { ok: boolean; count: number };
    console.log(`Pushed ${result.count} events from ${bucketId}`);
    return true;
  } catch (err) {
    console.error(`Error pushing events: ${err}`);
    return false;
  }
}

/**
 * Create and start an AW poller.
 */
export function createAwPoller(config: AwPollerConfig = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const cursors = new Map<string, string>();
  let running = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  async function poll() {
    if (!running) return;

    // Discover buckets if not configured
    let buckets = cfg.buckets;
    if (buckets.length === 0) {
      buckets = await discoverBuckets(cfg.awUrl);
      if (buckets.length === 0) {
        console.log("No AW buckets found. Is ActivityWatch running?");
      }
    }

    for (const bucketId of buckets) {
      const cursor = cursors.get(bucketId);
      const events = await fetchBucketEvents(cfg.awUrl, bucketId, cursor);

      if (events.length > 0) {
        // Update cursor to latest event timestamp
        const latestTimestamp = events
          .map((e) => e.timestamp)
          .sort()
          .pop();

        if (latestTimestamp) {
          cursors.set(bucketId, latestTimestamp);
        }

        // Push to Jerry
        await pushToJerry(cfg.jerryUrl, bucketId, events);
      }
    }

    // Schedule next poll
    if (running) {
      timeoutId = setTimeout(poll, cfg.pollInterval);
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      console.log(
        `Starting AW poller (interval: ${cfg.pollInterval}ms, AW: ${cfg.awUrl}, Jerry: ${cfg.jerryUrl})`
      );
      poll();
    },

    stop() {
      running = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      console.log("AW poller stopped");
    },

    isRunning() {
      return running;
    },
  };
}
