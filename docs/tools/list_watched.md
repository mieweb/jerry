# `list_watched`

Back to the [tool index](./tools.md).

**Source:** `packages/tools/src/runtime/file-tools.ts` (factory `createListWatchedTool`, `:72`)
**Egress:** none · **Requires:** database (`ctx.db`).

---

## What it does

Lists files captured by the folder watcher (screenshots, notes, documents) so the agent can see what's available to read or search. It reads the same `activity_events` table that `summarize_activity` uses, but filters for file-source events.

## Parameters (`file-tools.ts:77-92`)

| Param | Type | Notes |
|-------|------|-------|
| `prefix` | `string?` | Optional path prefix filter (e.g. `/Users/me/Screenshots`). |
| `limit` | `number` 1–100, default 20 | Nullable/optional; coerced to 20 when null. |

## Return shape

```jsonc
{
  "error": false,
  "count": 2,
  "files": [ { "path": "…", "name": "…", "extension": ".md", "size": 1234, "lastSeen": "<ISO>" } ]
}
```

---

## Execution pipeline

`execute` (`file-tools.ts:93-172`):

1. **Query.** Selects from `activity_events WHERE source IN ('folder', 'screenshot', 'folder-watcher') ORDER BY occurred_at DESC LIMIT ?` (`:96-102`). It fetches `limit * 2` rows to leave room for dedup (`:103`).
   - With `prefix`, the query adds `AND json_extract(payload, '$.path') LIKE '<prefix>%'` (`:105-115`).
2. **Empty** result → `{ error: false, files: [] }` (`:122-128`).
3. **Parse + dedup.** For each row, JSON-parse the payload, take `payload.path`, skip duplicates via a `Set`, and stop once `limit` files are collected (`:131-157`). Each file record derives `name` (payload or basename), `extension`, `size`, and `lastSeen` (the event's `occurred_at`).
4. **Errors** caught → `{ error: true, files: [] }` (`:164-170`).

---

## Failure & edge cases

- No matching events → empty list (not an error).
- Malformed payload rows are skipped silently (`:154-156`).
- Only returns files that produced `folder` / `screenshot` / `folder-watcher` events — content indexed via other paths may not appear here.

## Related

- Events are produced by the collector's folder watcher (`packages/collector/src/folder-watcher.ts`).
- Read a listed file with [`read_file`](./read_file.md).
