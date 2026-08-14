# `read_drive`

Back to the [tool index](./tools.md). Shared auth: [google-oauth.md](./google-oauth.md).

**Source:** `packages/tools/src/integrations/drive.ts` (factory `createReadDriveTool`, `:98`)
**API base:** `https://www.googleapis.com/drive/v3`
**Scope:** `drive.readonly` · **Egress:** `"ask"` (approval-gated)

---

## What it does

Read-only access to Google Drive. Two behaviors in one tool:

- **List mode** — list files, optionally filtered by a Drive query string.
- **Get mode** — fetch a single file's metadata by `fileId`, and optionally its text content.

Use it to answer questions about documents, shared files, or recent Drive activity.

## Parameters (`drive.ts:105-134`)

| Param | Type | Notes |
|-------|------|-------|
| `q` | `string?` | Drive query syntax: `sharedWithMe`, `'me' in owners`, `name contains 'report'`, `modifiedTime > '2024-01-01T00:00:00'`. Use **ISO timestamps**, not words like "today". Defaults to `trashed = false`. |
| `fileId` | `string?` | If set, ignores `q` and returns that file's metadata (get mode). |
| `maxResults` | `number` 1–100, default 20 | Coerced from string (`z.coerce`). |
| `includeContent` | `boolean` default false | In get mode, also download the file's text content. |

Requested metadata fields (`FILE_FIELDS`, `drive.ts:90`): `id, name, mimeType, modifiedTime, shared, webViewLink, owners, size`.

## Return shape

Union `DriveResult` (`drive.ts:74-78`): `NeedsAuthResult | DriveListResult | DriveGetResult | DriveErrorResult`. Use `isNeedsAuth()` (`drive.ts:83-85`) to detect the auth-required case.

- List: `{ error: false, files: DriveFile[], nextPageToken? }`
- Get: `{ error: false, file: DriveFile, content?: string }`
- Error: `{ error: true, message }`

---

## Execution pipeline

`execute` (`drive.ts:135-169`):

1. **Auth.** `deps.getAccessToken()`; on throw, return `{ needsAuth: true, authUrl, message }` (`:138-151`). See [google-oauth.md](./google-oauth.md).
2. **Branch on `fileId`:**
   - **Get mode → `getFile()`** (`drive.ts:217-246`): GET `/files/{id}?fields=…`. If `includeContent`, call `fetchFileContent()`.
   - **List mode → `listFiles()`** (`drive.ts:176-212`): GET `/files?pageSize=…&fields=files(…),nextPageToken&orderBy=modifiedTime desc&q=…` (defaults `q` to `trashed = false`, `:188`).
3. **Errors** from the API are caught and returned as `{ error: true, message }` with status + truncated body (`:163-168`, and per-call at `:194-200`, `:226-232`).

### Content download logic (`fetchFileContent`, `drive.ts:252-297`)

- **Google Docs/Sheets/Slides** are **exported** via `/export?mimeType=…` → `text/plain` (docs/slides) or `text/csv` (sheets) (`:260-270`).
- **Text-like** files (`text/*`, `application/json`, `application/javascript`, `application/xml`) use **media download** `?alt=media` (`:271-277`).
- Any other MIME type returns `undefined` (no content).
- Content is capped at **50,000 chars**, truncated with a `... [content truncated]` marker (`:258`, `:290-292`).

---

## Failure & edge cases

- No/expired tokens → needs-auth result (not an error).
- Non-2xx Drive responses → `DriveErrorResult` with the HTTP status and first 200 chars of the body.
- Binary files: metadata returns fine; `content` is omitted.

## Notes

- **Read-only** by scope — the tool cannot modify Drive.
- `fetchFn` is injectable (`drive.ts:22`, `:99`) for tests.
