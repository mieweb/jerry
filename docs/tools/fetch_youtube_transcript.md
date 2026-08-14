# `fetch_youtube_transcript`

Back to the [tool index](./tools.md). Shared auth: [google-oauth.md](./google-oauth.md).

**Source:** `packages/tools/src/integrations/youtube.ts` (factory `createFetchYoutubeTranscriptTool`, `:511`)
**API:** YouTube Captions API — `captions.list` / `captions.download`
**Scope:** `youtube.force-ssl` · **Egress:** `"ask"` (approval-gated)

---

## What it does

Returns a video's **transcript** (spoken content) as both plain text and timed segments. This is the **only** tool that returns captions.

Because it uses the official Captions API, the video **must belong to the authenticated user's account** — third-party creators' videos are not accessible through this API. If you don't have the `videoId`, pass a natural-language `query` (title keywords) and the tool resolves the video itself, in the same call.

## Parameters (`youtube.ts:528-557`)

Pre-processed to coerce `null` / `""` / `"null"` / `"undefined"` → `undefined`.

| Param | Type | Notes |
|-------|------|-------|
| `videoId` | `string?` | Used directly when known. |
| `query` | `string?` | Title keywords; matched by keyword overlap against the user's recent uploads. Ignored if `videoId` is set. |
| `language` | `string?` | Preferred caption language (ISO 639-1, e.g. `en`). Omit to accept any track. |

At least one of `videoId` / `query` is required (`:563-568`).

## Return shape (`YouTubeTranscriptResult`, `youtube.ts:104-115`)

```jsonc
{
  "error": false,
  "videoId": "…",
  "title": "…",          // present when resolved from `query`
  "language": "en",
  "trackKind": "asr",     // "standard" (creator) or "asr" (auto-generated)
  "transcript": "full plain text …",
  "segments": [ { "start": 0, "duration": 3.2, "text": "…" }, … ]
}
```

---

## Execution pipeline

`execute` (`youtube.ts:558-624`):

1. **Validate** that `videoId` or `query` is present (`:563-568`); **auth** → token, else needs-auth result (`:570-584`).
2. **Resolve the video** when only `query` is given (`:594-610`):
   - Fetch the **50 most recent uploads** via `listMyVideos()` (`RECENT_UPLOADS_LIMIT`, `youtube.ts:21`).
   - Run **`findBestTitleMatch(query, videos)`** (`youtube.ts:481-498`):
     - tokenize the query to lowercase alphanumeric tokens (`tokenizeForMatch`, `:462-468`),
     - drop filler/stop words (`get`, `me`, `the`, `video`, `transcript`, …) from `TITLE_MATCH_STOP_WORDS` (`:452-457`),
     - score each candidate by how many query keywords appear in its title, return the highest-scoring (or `undefined`).
   - No match → `{ error: true }` explaining to try different keywords or pass `videoId` (`:600-607`).
   - Why local matching: YouTube's `forMine` search matches titles too literally for natural-language phrases.
3. **Fetch captions** — **`fetchTranscript(fetchFn, headers, videoId, language)`** (`youtube.ts:846-920`):
   - `GET /captions?part=snippet&videoId=…` lists tracks (`:852-885`). No tracks → `{ error: true }` (captions absent or still processing).
   - **Track selection priority** (`:887-890`): exact `language` match → auto-generated (`trackKind === "asr"`) → first available.
   - `GET /captions/{id}?tfmt=srt` downloads the track as **SRT** (`:892-902`).
   - **`parseSrt`** (`:940-962`) splits blocks, converts `HH:MM:SS,mmm` → seconds (`srtTimeToSeconds`, `:925-935`), builds `{ start, duration, text }` segments; the plain `transcript` is the joined, whitespace-normalized text (`:906-910`).
4. **Return** the transcript; when resolved from `query`, the matched `title` is attached so the agent can confirm the pick (`:612-616`).

---

## Failure & edge cases

- Video not owned by the user → Captions API returns an error (surfaced as `{ error: true }` with status).
- No caption tracks → clear message that captions may be missing or still processing (`:880-885`).
- Neither `videoId` nor `query` → validation error.
- No/expired tokens → needs-auth result.

## Notes

- The description (`youtube.ts:515-527`) explicitly tells the model **not** to call `fetch_youtube` first — this tool resolves the video from `query` itself, saving a step and an approval.
- `fetchFn` is injectable (`youtube.ts:512`) for tests.
