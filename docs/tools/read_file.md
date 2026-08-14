# `read_file`

Back to the [tool index](./tools.md).

**Source:** `packages/tools/src/runtime/file-tools.ts` (factory `createReadFileTool`, `:13`)
**Egress:** none · **Requires:** bucket storage binding (`ctx.bucket`).

---

## What it does

Reads the raw contents of a file from Jerry's bucket storage by its path/key. Use it to retrieve documents, notes, or other files that were indexed or captured.

## Parameters (`file-tools.ts:18-20`)

| Param | Type | Notes |
|-------|------|-------|
| `path` | `string` (required) | The path/key of the file as stored (bucket keys are typically absolute file paths). |

## Return shape

```json
{ "error": false, "path": "…", "size": 1234, "content": "…" }
```

---

## Execution pipeline

`execute` (`file-tools.ts:21-56`):

1. **Guard.** No `ctx.bucket` → `{ error: true, content: null }` (`:22-28`).
2. **Fetch.** `ctx.bucket.get(path)` (`:31`). Missing object → `{ error: true, message: "File not found: …", content: null }` (`:33-39`).
3. **Read text.** `object.text()` → return `{ error: false, path, size: object.size, content }` (`:41-48`).
4. **Errors** caught → `{ error: true, content: null }` (`:49-55`).

---

## Failure & edge cases

- No bucket binding → not-available error.
- Wrong key → "File not found". Bucket keys are the **absolute path** used at ingest time; for content discovered via footnote search, prefer [`read_document`](./footnote-search.md) with the search-result path.

## Related

- Files are written to the bucket by [`index_document`](./index_document.md) and by the collector's `PUT /v1/files/:path` (`packages/collector/src/ingest.ts:46-53`).
- To discover available paths, use [`list_watched`](./list_watched.md).
