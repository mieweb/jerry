# `search_memory`

Back to the [tool index](./tools.md).

**Source:** `packages/tools/src/runtime/search-memory.ts` (factory `createSearchMemoryTool`, `:26`)
**Egress:** none · **Requires:** vector index binding (`ctx.vectors`) + Ollama for query embeddings.

---

## What it does

Semantic search over the user's indexed documents, notes, and screenshots — finds content by **meaning**, not exact matches. Use it when the user asks about something they saw, wrote, or captured earlier.

> **Runtime swap:** when the footnote MCP server is connected, `createJerryToolsWithMcp` **removes** `search_memory` in favor of `search_hybrid` (`create-tools.ts:203-207`). See [footnote-search.md](./footnote-search.md).

## Parameters (`search-memory.ts:32-46`)

| Param | Type | Notes |
|-------|------|-------|
| `query` | `string` (required) | Describe the content you're looking for. |
| `limit` | `number` 1–20, default 5 | Nullable/optional; coerced to 5 when null. |

## Return shape

```jsonc
{
  "error": false,
  "query": "…",
  "resultCount": 3,
  "results": [ { "id": "doc_…", "score": 0.87, "title": "…", "snippet": "…", "source": "…" } ]
}
```

---

## Execution pipeline

`execute` (`search-memory.ts:47-108`):

1. **Guard.** If `ctx.vectors` is unset → `{ error: true, message: "Vector search is not available…" }` (`:48-55`).
2. **Embed the query.** `getEmbedding(query)` (`runtime/embeddings.ts:29-55`) POSTs to Ollama `POST {baseUrl}/api/embeddings` with `model: nomic-embed-text` (768-dim). Returns `null` on failure → `{ error: true }` explaining Ollama/model may be missing (`:59-68`).
3. **Query the index.** `ctx.vectors.query(queryVector, { topK: limit, returnMetadata: "all" })` (`:70-73`).
4. **Map results** to `{ id, score, metadata }`, then to `{ id, score, title, snippet, source }` pulling from `metadata` (`:75-99`). No matches → `{ error: false, results: [] }` (`:81-87`).
5. **Errors** are caught → `{ error: true, message }` (`:101-107`).

---

## Failure & edge cases

- No vector binding → not-available error.
- Ollama down / `nomic-embed-text` missing → embedding is `null` → descriptive error.
- Empty index / no hits → `error: false` with empty `results`.

## Related

- Content is added by [`index_document`](./index_document.md).
- Preferred replacement when available: [`search_hybrid`](./footnote-search.md).
- Also exposed over MCP (see [`../mcp-server.md`](../mcp-server.md)).
