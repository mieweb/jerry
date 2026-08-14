# `index_document`

Back to the [tool index](./tools.md).

**Source:** `packages/tools/src/runtime/index-document.ts` (factory `createIndexDocumentTool`, `:31`)
**Egress:** none · **Requires:** vector index binding (`ctx.vectors`) + Ollama for embeddings; optional bucket for raw content.

---

## What it does

Indexes a document into the semantic search system so it can later be found with [`search_memory`](./search_memory.md). The content is embedded and upserted into the vector index, and (if a bucket is configured) the raw text is stored for [`read_file`](./read_file.md) retrieval.

## Parameters (`index-document.ts:36-43`)

| Param | Type | Notes |
|-------|------|-------|
| `path` | `string` (required) | Key to store the document under (also used to derive the id). |
| `content` | `string` (required) | Text content to embed/index. |
| `metadata` | `Record<string,string>?` | Optional `title`, `source`, tags, etc. |

## Return shape

```json
{ "error": false, "indexed": true, "id": "doc_…", "path": "…", "embeddingDimensions": 768 }
```

---

## Execution pipeline

`execute` (`index-document.ts:44-109`):

1. **Guard.** No `ctx.vectors` → `{ error: true, indexed: false }` (`:45-51`).
2. **Embed.** `getEmbedding(content)` (`runtime/embeddings.ts:29-55`, Ollama `nomic-embed-text`, 768-dim). `null` → descriptive error (`:57-64`).
3. **Derive id.** `generateDocumentId(path)` (`index-document.ts:16-25`) — a stable 32-bit hash of the path rendered as `doc_<base36>`, so re-indexing the same path **upserts** rather than duplicates.
4. **Assemble metadata** (`:69-76`): spreads user `metadata`, then sets `path`, `title` (`metadata.title` or basename), `snippet` (first 500 chars), `source` (default `"indexed"`), `indexedAt`.
5. **Upsert vector** — `ctx.vectors.upsert([{ id, values: embedding, metadata }])` (`:79-85`).
6. **Store raw content** in the bucket if present — `ctx.bucket.put(path, content, { httpMetadata, customMetadata })` (`:88-93`) so `read_file` can return it later.
7. **Return** `{ indexed: true, id, path, embeddingDimensions }` (`:95-101`); errors caught → `{ error: true, indexed: false }` (`:102-108`).

---

## Failure & edge cases

- No vector binding → not-available error.
- Ollama down / model missing → `null` embedding → descriptive error.
- Same `path` re-indexed → same id → in-place update (no duplicate).

## Related

- The collector performs the same upload+index over HTTP (`POST /v1/index`, see `packages/collector/src/ingest.ts:69-90`); this tool is the in-agent equivalent.
- Search it back with [`search_memory`](./search_memory.md).
