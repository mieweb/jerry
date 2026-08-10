# @mieweb/jerry-app

The deployable Jerry worker: `fetch`/`queue`/`scheduled` handlers, `AgentSession` Durable Object, and the backend-agnostic Jerry agent definition (instructions + tools).

See [plan.md §6](../../plan.md) for architecture details.

## Environment Variables

### Google OAuth (for `read_drive`, `post_youtube`, `fetch_youtube`, `fetch_youtube_transcript` tools)

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | OAuth2 client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | OAuth2 client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | Callback URL, e.g. `http://127.0.0.1:8787/v1/oauth/google/callback` |
| `JERRY_OAUTH_ENCRYPTION_KEY` | 32-byte key for token encryption (64 hex chars or 44 base64 chars) |

When the three `GOOGLE_*` vars are present on the worker `env`, the Google integration tools become functional. Users connect via:

```
GET /v1/oauth/google/start?userId=<userId>
```

This redirects to Google consent, then back to `/v1/oauth/google/callback` which stores encrypted tokens.

**Local `pnpm dev`:** put `GOOGLE_*` and `JERRY_OAUTH_ENCRYPTION_KEY` in the repo `.env` (see `.env.example`). `pnpm dev` loads `.env` via `@mieweb/jerry-cli/load-env`; restart after changes. See [docs/manual.md §19](../../docs/manual.md#19-phase-2-slice-5--external-integrations-drive--youtube).

**One-shot CLI:** `jerry --approve <message>` forces `egress=allow-tools` and auto-approves `waiting_for_approval` (Drive / YouTube ask tools).

**OAuth Scopes:** The consent screen requests Drive (`drive.readonly`) and YouTube (`youtube.upload`, `youtube.readonly`, `youtube.force-ssl`) scopes. If you previously authorized with an older scope set (Drive-only, or before `youtube.force-ssl` was added for transcripts), you must re-consent via `/v1/oauth/google/start` to enable the newer tools.

### Integration Tools

| Tool | Disposition | Description |
|------|-------------|-------------|
| `read_drive` | `ask` | List/search files in Google Drive, optionally fetch content |
| `post_youtube` | `ask` | Upload a video to YouTube (max 100 MB multipart) |
| `fetch_youtube` | `ask` | Fetch video metadata or search the user's channel |
| `fetch_youtube_transcript` | `ask` | Fetch a video's transcript/captions (own videos only, via the official Captions API). Accepts `videoId` or a `query` (title/description) — resolves the video internally in the same call/approval, no need to call `fetch_youtube` first |

**Note:** YouTube uploads larger than 100 MB require resumable upload (not yet supported) or YouTube Studio.

### Egress Policy

To use integration tools, the profile must have `egress: "allow-tools"`. Under `deny` or `allow-model`, these tools are filtered out at turn start.

When a tool has `"ask"` disposition, the session pauses for user approval before the tool executes. The user confirms via a resume message and the tool runs.

## Testing

### Mock Tests

Unit tests for OAuth, Drive, and YouTube use injectable `fetchFn` and mock dependencies — no Google credentials required:

```bash
pnpm --filter @mieweb/jerry-tools test
```

### Live Tests

Live integration tests are manual only (no `JERRY_INTEGRATION=google` opt-in suite). See [docs/manual.md](../../docs/manual.md) Section 19 for the acceptance runbook.
