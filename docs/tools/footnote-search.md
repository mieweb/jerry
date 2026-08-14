# Footnote MCP search tools

Back to the [tool index](./tools.md).

**Source:** `packages/tools/src/mcp/footnote-adapter.ts` (`createFootnoteMcpTools`, `:75`)
**Loading:** dynamic, over stdio MCP · **Egress:** none

These four tools wrap the footnote MCP server (a portable SQLite hybrid-index RAG tool: FTS5 + sqlite-vec) into AI SDK `tool()` shape. They are loaded before a turn by `ensureMcpTools` → `loadMcpTools` (`packages/jerry-app/src/create-tools.ts:63-95`) when MCP is available, and merged into the tool set (`create-tools.ts:198-207`). When `search_hybrid` is present, the in-process [`search_memory`](./search_memory.md) is dropped so the agent prefers hybrid search.

Common helpers in the adapter:
- **`limitParam`** (`footnote-adapter.ts:21-28`) — coerces string→number, clamps 1–20, default 5 (local models often pass `"10"`).
- **`extractTextContent`** (`:33-46`) — flattens MCP text content; surfaces `Error: …` on `isError`.
- **`parseSearchResults`** (`:51-67`) — parses JSON results into `{ path, score?, snippet? }`; falls back to a raw snippet.

All search tools return `{ source: "footnote-mcp", method, query|pattern, results, count }`; on failure `{ error: true, message, results: [] }`.

---

## `search_hybrid` (`footnote-adapter.ts:77-114`)

**What:** Combined **vector similarity + full-text** search. Preferred over `search_memory` for richer results.

**Params:** `query: string`, `limit?` (1–20, default 5).

**How:** calls MCP tool `search_hybrid` with `{ query, k: limit }` (`:90-93`), extracts text, parses results.

---

## `search_fts` (`footnote-adapter.ts:116-149`)

**What:** Full-text search using **BM25** ranking. Good for specific keywords/phrases.

**Params:** `query: string`, `limit?`.

**How:** calls MCP `search_fts` with `{ query, k: limit }` (`:125-128`). Works without an embedder at query time.

---

## `search_literal` (`footnote-adapter.ts:151-184`)

**What:** Exact string / **grep-like** match. Use for a specific phrase or code snippet.

**Params:** `pattern: string`, `limit?`.

**How:** calls MCP `search_literal` with `{ query: pattern, k: limit }` (`:160-163`). Returns `pattern` (not `query`) in its result object.

---

## `read_document` (`footnote-adapter.ts:186-215`)

**What:** Fetch the **full content** of a document by its path. Use after a search to get complete text.

**Params:** `path: string`.

**How:** calls MCP `read_document` with `{ doc_id: path }` (`:194-196`); returns `{ source, path, content, length }`.

---

## Operational notes

- The footnote child reads its index once at startup; after the collector rebuilds the index it calls `POST /v1/mcp/reload`, and `reloadMcpTools` (`create-tools.ts:241-258`) restarts the child against the fresh index.
- Keyword tools (`search_fts`, `search_literal`) need no embedder at query time, so they still answer when Ollama is stopped; `search_hybrid` needs embeddings for meaningful similarity scores.
- Tool name list: `FOOTNOTE_TOOL_NAMES` (`footnote-adapter.ts:222-227`).
- Setup / index management: [`../manual.md` §10 and §20](../manual.md).
