# `fetch_youtube`

Back to the [tool index](./tools.md). Shared auth: [google-oauth.md](./google-oauth.md).

**Source:** `packages/tools/src/integrations/youtube.ts` (factory `createFetchYoutubeTool`, `:339`)
**API base:** `https://www.googleapis.com/youtube/v3`
**Scope:** `youtube.readonly` · **Egress:** `"ask"` (approval-gated)

---

## What it does

Fetches video **metadata** (title, privacy, URL, thumbnail, publish date) from the authenticated user's own YouTube channel. It has **three modes**.

> It **never** returns transcripts or captions. For spoken content, use [`fetch_youtube_transcript`](./fetch_youtube_transcript.md) — which resolves a video from a title query on its own, so you don't need to call `fetch_youtube` first.

## Parameters (`youtube.ts:354-398`)

All params are pre-processed to coerce `null` / `""` / `"null"` / `"undefined"` → `undefined`, because small local models frequently emit those literals.

| Param | Type | Mode |
|-------|------|------|
| `videoId` | `string?` | **Mode 2** — fetch one video's metadata. |
| `q` | `string?` | **Mode 3** — search within the user's own uploads (`forMine`). Ignored if `videoId` set. |
| `maxResults` | `number` 1–50, default 10 | Applies to search/list. |
| `listAll` | `boolean?` | **Mode 1** — paginate through *every* upload (when `videoId` and `q` are both omitted). |

## Return shape

`YouTubeFetchResult { error: false, videos: YouTubeVideo[], nextPageToken? } | NeedsAuth | Error`.

---

## Execution pipeline

`execute` (`youtube.ts:399-443`):

1. **Auth.** `deps.getAccessToken()`; on throw → needs-auth result (`:405-419`). See [google-oauth.md](./google-oauth.md).
2. **Normalize** `videoId`/`q` again (`:426-427`) in case a model still passed `null`.
3. **Mode selection** (`:429-436`):
   - **`videoId` → `getVideo()`** (`youtube.ts:630-679`): `GET /videos?part=snippet,status&id=…`; maps items to `YouTubeVideo` (id, title, description, channel, publishedAt, privacyStatus, url, thumbnail).
   - **`q` → `searchVideos()`** (`youtube.ts:684-738`): `GET /search?part=snippet&type=video&forMine=true&q=…&maxResults=…`. `forMine=true` scopes to the user's library so **private/unlisted** videos are included (site-wide search would miss them). Returns `nextPageToken`.
   - **neither → `listMyVideos()`** (`youtube.ts:743-841`): two-step —
     1. `GET /channels?part=contentDetails&mine=true` to find the **uploads playlist id** (`:749-773`).
     2. Paginate `GET /playlistItems?part=snippet,status&playlistId=…` (`:781-834`), accumulating videos until `maxResults` is reached, or every page when `listAll=true` (page size 50).
4. **Errors** are caught and returned as `{ error: true, message }` (`:437-442`), and per-call with HTTP status + truncated body.

---

## Failure & edge cases

- No uploads playlist → `{ error: false, videos: [] }` (`:774-776`).
- No/expired tokens → needs-auth result.
- Non-2xx from any sub-call → `{ error: true }` with status + first 200 chars of the body.

## Notes

- The tool description (`youtube.ts:343-353`) instructs the model to report `title`/`privacy`/`url` **verbatim** (never invent) and to route transcript requests to `fetch_youtube_transcript`.
- `fetchFn` is injectable (`youtube.ts:340`) for tests.
