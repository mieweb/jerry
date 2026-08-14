# `summarize_activity`

Back to the [tool index](./tools.md).

**Source:** `packages/tools/src/runtime/summarize-activity.ts` (factory `createSummarizeActivityTool`, `:124`)
**Registered:** `packages/tools/src/runtime/index.ts:57`
**Egress:** none — reads locally-ingested data only (not gated by approval).

---

## What it does

Produces a summary of the user's activity for a natural-language time range — which apps were used, which websites were visited, which video meetings occurred, and overall productivity signals. It is Jerry's flagship "explain my work" tool.

It never contacts ActivityWatch directly. The **collector** polls ActivityWatch and pushes events into the `activity_events` table (see [data flow](#data-flow)); this tool only reads that table, so it works offline against whatever was already ingested.

## Parameters

| Param | Type | Notes |
|-------|------|-------|
| `range` | `string` (required) | Natural-language window, e.g. `"last 2 hours"`, `"today"`, `"yesterday afternoon"`, `"this morning"`, `"last 90 minutes"`, or a calendar range like `"May 13 to May 20"`. Schema at `summarize-activity.ts:130-136`. |

## Return shape

```jsonc
{
  "error": false,
  "range": { "start": "<ISO>", "end": "<ISO>" },
  "formatted": "## ActivityWatch data …",   // LLM-ready markdown
  "summary": {
    "bucketCount": 4,
    "rangeHours": 2,
    "topActivities": [ /* top 5 */ ],
    "topWebLinks":  [ /* top 5 */ ],
    "meetingCount": 1,
    "totalEventCount": 812
  }
}
```

`formatted` (from `formatActivityContext`) is the full markdown block; `summary` is a trimmed structured view (`summarize-activity.ts:191-203`).

---

## Execution pipeline (step by step)

All logic runs in the `execute` callback (`summarize-activity.ts:137`).

### Step 1 — Parse the natural-language range
`summarize-activity.ts:139-151` calls `resolveActivityRange(range, undefined, undefined, { strict: false })`.

- **`resolveActivityRange`** — `aw/intent.ts:212-238`. With `strict: false`, a failed parse falls back to "today" (`intent.ts:233-235`) rather than throwing.
- Delegates to **`parseActivityRangeFromPrompt`** — `aw/intent.ts:156-197`, which tries, in order:
  1. **`parseCalendarRangeFromPrompt`** (from `aw/dates.ts`, `intent.ts:157`) — explicit calendar ranges (`"May 13 to May 20"`).
  2. `"last N hours"` / `"past N hours"` → **`rollingHours`** (`intent.ts:19-24`, `164-178`).
  3. `"last hour"` / `"past hour"` → `rollingHours(1, …)` (`intent.ts:180-182`).
  4. **`mentionsYesterday`** (`intent.ts:47-64`) → **`calendarYesterday`** (`intent.ts:77-86`).
  5. `"today"` / `"this morning"` / `"this afternoon"` → **`calendarToday`** (`intent.ts:32-40`, `188-194`).
- Produces `{ start, end, label }`; the tool converts `start`/`end` to ISO strings (`summarize-activity.ts:150-151`).

### Step 2 — Query events from the DB
`summarize-activity.ts:154` → **`queryActivityEvents(ctx.db, startISO, endISO)`** (`:28-49`):

- `SELECT id, source, payload, occurred_at FROM activity_events WHERE occurred_at >= ? AND occurred_at <= ? ORDER BY occurred_at ASC` (`:34-41`) — uses index `idx_activity_occurred` (`packages/jerry-app/migrations/0001_events.sql:67`).
- JSON-parses each `payload` into a `StoredActivityEvent` (`:43-48`).
- **Early exit:** zero events → `summary: null` with a friendly message (`:156-163`), `error: false`.

### Step 3 — Reshape into ActivityWatch form
`summarize-activity.ts:166` → **`transformToAwFormat(events)`** (`:60-95`):

- Keeps **only `source === "aw"`** events (`:68`); folder/screenshot events are ignored here.
- Reads each event's `payload.bucketId` / `payload.events` (the shape the collector pushed, `packages/collector/src/aw-poller.ts:120-127`) and groups raw events by bucket (`:72-82`).
- Returns `buckets[]`, `eventsByBucket`, and `pagesByBucket` (each bucket = 1 page, `:91`).
- **Early exit:** events existed but none AW → `summary: null` (`:168-175`).

### Step 4 — Aggregate into a structured summary (pure functions)
`summarize-activity.ts:178-183` → **`buildActivitySummary(...)`** (`aw/build-summary.ts:110-197`).

For each watcher in `WATCHERS = ["window", "web", "vscode", "afk"]` (`build-summary.ts:20`, loop `:135`):

1. **`pickBucket`** (`:44-60`) selects the machine's bucket, classifying ids via **`watcherFromBucketId`** (`:27-34`).
2. **`filterEventsInRange`** (`aw/event-range.ts:11-22`) keeps events in the half-open `[start, end)`.
3. **`aggregateTopActivities`** (`aw/aggregate.ts:76-105`) sums duration + count per `(watcher, app, title)`, sorted desc, capped at 20. App/title from **`labelFromEvent`** (`aggregate.ts:44-62`).
4. **web watcher only** (`build-summary.ts:148-151`):
   - **`aggregateTopWebLinks`** (`aggregate.ts:166-204`) — normalizes URLs, filters to work-related hosts (`WORK_HOST_SUFFIXES`, `aggregate.ts:13-42`; `isWorkRelatedUrl` `:152-158`), sums per URL, top 25.
   - **`aggregateMeetingSessions`** (`aggregate.ts:286-366`) — detects Meet/Zoom/Teams (`MEETING_HOSTS`, `:211-216`), groups contiguous slices with a 10-min gap (`MEETING_GAP_MS`, `:206`), extracts codes (`meetingCodeFromUrl`, `:249-268`), top 12.
5. **`newestEvent`** (`build-summary.ts:82-89`) tracks the latest event per watcher; AFK status captured at `:165-167`.

After the loop: **`mergeTopActivities`** (`aggregate.ts:113-120`) merges across watchers (`build-summary.ts:170`); `latest` sorted newest-first (`:172-174`); totals computed (`:176-179`). Returns the `AwActivitySummary` (`:181-196`).

### Step 5 — Persist
`summarize-activity.ts:186` → **`saveSummary`** (`:100-119`): `INSERT INTO summaries (id, session_id, range_start, range_end, summary, created_at)` with a random UUID and JSON-stringified summary. Table in `migrations/0001_events.sql`.

### Step 6 — Format for the model
`summarize-activity.ts:189` → **`formatActivityContext(summary)`** (`aw/format.ts:46-120`): header + window/ISO/span/counts (`:47-55`), AFK (`:57-61`), **Video meetings** via `formatMeetingLine` (`:26-36`, `:63-72`), **Top activities** (`:76-86`), **Work-related web links** as markdown links (`:88-102`), **Latest snapshot per watcher** (`:104-112`), closing usage rules (`:114-117`). Durations humanized by `formatDuration` (`:4-15`).

### Step 7 — Return
`summarize-activity.ts:191-203` returns `{ error, range, formatted, summary }` (see [Return shape](#return-shape)).

---

## Call graph

```
execute(range)                                  summarize-activity.ts:137
├─ resolveActivityRange                          intent.ts:212
│   └─ parseActivityRangeFromPrompt              intent.ts:156
│       ├─ parseCalendarRangeFromPrompt          dates.ts (imported)
│       ├─ rollingHours                          intent.ts:19
│       ├─ calendarYesterday / mentionsYesterday intent.ts:77 / :47
│       └─ calendarToday                         intent.ts:32
├─ queryActivityEvents  ── SELECT activity_events  summarize-activity.ts:28
├─ transformToAwFormat  (source==="aw" grouping) summarize-activity.ts:60
├─ buildActivitySummary                          build-summary.ts:110
│   ├─ pickBucket / watcherFromBucketId          build-summary.ts:44 / :27
│   ├─ filterEventsInRange                        event-range.ts:11
│   ├─ aggregateTopActivities                     aggregate.ts:76
│   ├─ aggregateTopWebLinks (web)                 aggregate.ts:166
│   ├─ aggregateMeetingSessions (web)             aggregate.ts:286
│   └─ mergeTopActivities                         aggregate.ts:113
├─ saveSummary  ── INSERT summaries              summarize-activity.ts:100
└─ formatActivityContext                          format.ts:46
```

---

## Data flow

The tool sits at the end of a poll → push → store → query chain:

```
ActivityWatch (localhost:5600)
   │  GET /api/0/buckets , GET /api/0/buckets/{id}/events?start=…   (collector polls every 30s, cursor-tracked)
   ▼
Collector aw-poller (packages/collector/src/aw-poller.ts)
   │  POST /v1/events   { source:"aw", occurredAt, payload:{bucketId, events} }
   ▼
Jerry worker /v1/events (vendor/cloud/packages/cloud-agent/src/host.ts:67) → insertActivityEvent → activity_events
   ▼
summarize_activity → SELECT … FROM activity_events → aggregate → summary
```

Only the collector talks to ActivityWatch's `:5600` API; the worker stores events, and this tool reads them.

---

## Failure & edge-case behavior

- **Unparseable range** in strict mode throws `NO_TIME_RANGE_ERROR`; here `strict: false` falls back to "today". A caught parse error returns `{ error: true, message }` (`:142-147`).
- **No events / no AW events** → `error: false, summary: null` with an explanatory message (not treated as a failure).
- Web links and meetings are computed **only** from the `web` bucket; activities are merged across all watchers.

## Design notes

- The tool does I/O only (parse → read → aggregate → write → format). All computation lives in pure functions under `packages/tools/src/aw/*`, independently unit-tested (`aggregate.test.ts`, `build-summary.test.ts`, `format.test.ts`, `intent.test.ts`).
- Also exposed over MCP (see [`../mcp-server.md`](../mcp-server.md)).
