# `post_youtube`

Back to the [tool index](./tools.md). Shared auth: [google-oauth.md](./google-oauth.md).

**Source:** `packages/tools/src/integrations/youtube.ts` (factory `createPostYoutubeTool`, `:207`)
**Upload URL:** `https://www.googleapis.com/upload/youtube/v3/videos`
**Scope:** `youtube.upload` · **Egress:** `"ask"` (approval-gated)

---

## What it does

Uploads a **local video file** to the authenticated user's YouTube channel. Videos are uploaded as **private by default**. Used to share recordings/content Jerry has on disk.

## Parameters (`youtube.ts:214-224`)

| Param | Type | Notes |
|-------|------|-------|
| `filePath` | `string` (required) | Local path to the video file. |
| `title` | `string` 1–100 chars (required) | |
| `description` | `string?` ≤5000 chars | |
| `privacyStatus` | `"private" \| "unlisted" \| "public"` default `private` | |
| `tags` | `string[]?` ≤30 | |

## Return shape

`YouTubeUploadResult | YouTubeNeedsAuthResult | YouTubeErrorResult`:

```json
{ "error": false, "videoId": "…", "title": "…", "privacyStatus": "private", "url": "https://www.youtube.com/watch?v=…" }
```

---

## Execution pipeline

`execute` (`youtube.ts:225-329`):

1. **Precondition — file reader.** Requires `deps.readVideoFile` (`youtube.ts:232-237`). The worker injects a Node `fs`-backed reader in `create-tools.ts:171-187` that returns `{ bytes, mimeType, size }` (MIME inferred from extension). Without it → `{ error: true }`.
2. **Auth.** `deps.getAccessToken()`; on throw → needs-auth result (`:239-253`). See [google-oauth.md](./google-oauth.md).
3. **Read file + size check.** `readVideoFile(filePath)` (`:255-263`). Enforces the **100 MB** cap `MAX_FILE_SIZE` (`youtube.ts:13`, check `:265-270`); larger files are rejected with a message pointing to YouTube Studio.
4. **Build metadata + body** (`:272-287`):
   - `snippet`: `title`, `description ?? ""`, `tags ?? []`, `categoryId: "22"` (People & Blogs).
   - `status`: `privacyStatus`, `selfDeclaredMadeForKids: false`.
   - **`buildMultipartBody`** (`youtube.ts:161-199`) assembles a `multipart/related` body by hand: a JSON metadata part + a binary video part, joined by a generated boundary (`----JerryUpload<ts>`), concatenated into one `Uint8Array` via `TextEncoder` and byte offsets.
5. **Upload** (`:289-300`): `POST {UPLOAD_URL}?uploadType=multipart&part=snippet,status` with `Authorization: Bearer …`, `Content-Type: multipart/related; boundary=…`, and `Content-Length`.
6. **Result** (`:302-322`): success → `{ videoId, title, privacyStatus, url }` (watch URL from the returned id). Non-2xx → `{ error: true, message }` with status + truncated body. Thrown errors → `{ error: true }` (`:323-328`).

### MIME inference (`getMimeTypeFromPath`, `youtube.ts:142-156`)
Maps extensions (`mp4`, `mov`, `avi`, `wmv`, `flv`, `webm`, `mkv`, `3gp`, `m4v`) to MIME types, defaulting to `video/mp4`. Used only if `readVideoFile` didn't provide one.

---

## Failure & edge cases

- Missing file reader → not available error (environment-dependent).
- File > 100 MB → rejected before upload (multipart upload is single-request; large files must use YouTube Studio / resumable upload).
- No/expired tokens → needs-auth result.

## Notes

- The manual multipart body avoids extra dependencies so it runs unchanged on Cloudflare Workers and Node.
- `fetchFn` is injectable (`youtube.ts:40-41`, `:208`) for tests.
