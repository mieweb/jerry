# Jerry — Tool Reference

This is the index for Jerry's tools. It describes what each tool does at a glance and links to a dedicated document with a full technical deep dive (parameters, execution pipeline, functions, file/line references, failure modes).

Tools are AI SDK `tool()` definitions built in `@mieweb/jerry-tools` and assembled per turn by `createJerryTools` (`packages/tools/src/runtime/index.ts`) and `createJerryToolsWithMcp` (`packages/jerry-app/src/create-tools.ts`). Each tool receives a `ToolContext` (database handle, `sessionId`, and optional bindings for the vector index, bucket storage, and Google OAuth `integrations`) and returns a structured JSON result the model can reason over.

---

## Priority tools

| Tool | Summary | Doc |
|------|---------|-----|
| `summarize_activity` | Summarize the user's activity for a natural-language time range (apps, web, meetings, productivity). | [summarize_activity.md](./summarize_activity.md) |
| `read_drive` | Read-only Google Drive access: list files by query, or fetch one file's metadata/content. | [read_drive.md](./read_drive.md) |
| `post_youtube` | Upload a local video file to the user's YouTube channel (private by default). | [post_youtube.md](./post_youtube.md) |
| `fetch_youtube` | Fetch video **metadata** from the user's channel (by id, search, or list uploads). | [fetch_youtube.md](./fetch_youtube.md) |
| `fetch_youtube_transcript` | Fetch a video's **transcript/captions** as text + timed segments. | [fetch_youtube_transcript.md](./fetch_youtube_transcript.md) |

The four Drive/YouTube tools share a Google OAuth2 layer and an approval flow — see [google-oauth.md](./google-oauth.md).

## Search & file tools

| Tool | Summary | Doc |
|------|---------|-----|
| `search_memory` | Semantic (vector) search over indexed docs/screenshots. Dropped at runtime when `search_hybrid` is loaded. | [search_memory.md](./search_memory.md) |
| `index_document` | Embed and index new content so it's findable via `search_memory`. | [index_document.md](./index_document.md) |
| `read_file` | Read a stored/indexed file's contents by path from bucket storage. | [read_file.md](./read_file.md) |
| `list_watched` | List files captured by the folder watcher (screenshots, notes, documents). | [list_watched.md](./list_watched.md) |

## Footnote MCP search tools

Loaded dynamically over stdio MCP when available (see `packages/tools/src/mcp/footnote-adapter.ts`). All four are documented together in [footnote-search.md](./footnote-search.md).

| Tool | Summary |
|------|---------|
| `search_hybrid` | Vector + full-text hybrid search (preferred over `search_memory`). |
| `search_fts` | BM25 full-text search. |
| `search_literal` | Exact / grep-like string search. |
| `read_document` | Fetch a document's full content by path. |

---

## Cross-cutting concepts

- **[Google OAuth2 & approval flow](./google-oauth.md)** — shared auth, token refresh, encryption at rest, the needs-auth path, and the `"ask"` egress/approval gate used by the Drive/YouTube tools.
- **MCP exposure** — `summarize_activity` and `search_memory` are among the tools Jerry re-exposes as an MCP server (see [`../mcp-server.md`](../mcp-server.md)).
- **Data ingestion** — `summarize_activity`, `list_watched`, and `read_file` all read data the collector previously pushed; see [`../manual.md` §20](../manual.md) for the collector flow.
