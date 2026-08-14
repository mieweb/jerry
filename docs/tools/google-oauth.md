# Google OAuth2 & Approval Flow (shared)

`read_drive`, `post_youtube`, `fetch_youtube`, and `fetch_youtube_transcript` are **external-integration** tools. They share two cross-cutting mechanisms documented here so the per-tool docs don't repeat them:

1. **Google OAuth2** — how each tool gets a valid access token.
2. **Approval / egress gate** — the `"ask"` disposition that pauses the session for user consent.

Related docs: [read_drive](./read_drive.md) · [post_youtube](./post_youtube.md) · [fetch_youtube](./fetch_youtube.md) · [fetch_youtube_transcript](./fetch_youtube_transcript.md) · index: [tools.md](./tools.md).

---

## 1. OAuth2 authorization-code flow

**Source:** `packages/tools/src/integrations/oauth.ts` · Worker wiring: `packages/jerry-app/src/google-oauth.ts` and `packages/jerry-app/src/create-tools.ts`.

### How a tool obtains a token

Each tool is constructed with a `deps` object exposing two functions (`drive.ts:16-23`, `youtube.ts:35-44`):

- `getAccessToken(): Promise<string>` — returns a valid bearer token or throws.
- `getAuthorizationUrl(state?): string` — builds the consent URL for the needs-auth path.

In the worker these are wired in `createJerryToolsWithMcp` (`create-tools.ts:163-189`): the closure resolves the current user via `resolveUserId(ctx.db, ctx.sessionId)` and delegates to a Google `OAuthClient` created by `createGoogleOAuthClient(env, env.DB)`.

### `OAuthClient` methods (`oauth.ts:224-347`)

- **`getAuthorizationUrl(state)`** (`oauth.ts:230-245`) — builds `${authUrl}?response_type=code&client_id=…&redirect_uri=…&scope=…&access_type=offline&prompt=consent`. `access_type=offline` + `prompt=consent` ensure Google always returns a **refresh token**.
- **`exchangeAuthorizationCode(userId, code)`** (`oauth.ts:247-284`) — POSTs `grant_type=authorization_code` to the token endpoint, builds a `TokenSet { accessToken, refreshToken, expiresAt, scope, tokenType }`, and persists it via the token store.
- **`getValidAccessToken(userId)`** (`oauth.ts:286-341`) — loads the stored `TokenSet`; if it expires within **60 s** (`oauth.ts:295-296`) it refreshes using `grant_type=refresh_token`, saves the new set, and returns the fresh access token. Throws if no tokens or no refresh token.
- **`revoke(userId)`** (`oauth.ts:343-345`) — deletes the stored tokens.

### Token encryption at rest (`oauth.ts:68-161`)

- Tokens are encrypted with **AES-GCM**. The key comes from `JERRY_OAUTH_ENCRYPTION_KEY` (32 bytes as 64 hex chars or 44 base64 chars — `deriveEncryptionKey`, `oauth.ts:72-110`).
- `encryptTokenSet` (`oauth.ts:115-132`) generates a random 12-byte IV and stores `{ iv, ciphertext }` (both base64) in the `oauth_tokens` DB table; `decryptTokenSet` (`oauth.ts:137-161`) reverses it.
- A `TokenStore` interface (`oauth.ts:59-66`) abstracts persistence; `createMemoryTokenStore` (`oauth.ts:166-190`) is the in-memory test double.

### Provider configs

- **Drive** (`drive.ts:302-307`): scope `https://www.googleapis.com/auth/drive.readonly`.
- **YouTube** (`youtube.ts:967-976`): scopes `youtube.upload`, `youtube.readonly`, `youtube.force-ssl`.
- Both use auth URL `https://accounts.google.com/o/oauth2/v2/auth` and token URL `https://oauth2.googleapis.com/token`.

### Needs-auth path

When `getAccessToken()` throws (no/expired/invalid tokens), the tool does **not** error — it returns:

```json
{ "needsAuth": true, "authUrl": "https://accounts.google.com/…", "message": "… Visit <authUrl> to authorize access." }
```

The agent surfaces `authUrl` to the user. Discriminators: `isNeedsAuth()` (`drive.ts:83-85`) and `isYouTubeNeedsAuth()` (`youtube.ts:135-137`).

### Setup summary

1. Create a Google Cloud OAuth 2.0 Web client; add redirect URI `http://127.0.0.1:8787/v1/oauth/google/callback`.
2. Enable **Drive API** and **YouTube Data API v3**.
3. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `JERRY_OAUTH_ENCRYPTION_KEY` in the repo `.env`.
4. Connect an account at `http://127.0.0.1:8787/v1/oauth/google/start?userId=local`.

Full walkthrough: [`../manual.md` §19](../manual.md).

---

## 2. Approval & egress gate

All four Google tools carry an `"ask"` disposition. When the privacy profile's `egress` policy is `allow-tools`, `createJerryTools` wraps them with `wrapToolsWithAsk` (`packages/tools/src/runtime/wrap-ask.ts`):

- The first tool call parks the session in `waiting_for_approval` and records a pending row (with the validated arguments).
- On approval, `executePendingApproval` (`create-tools.ts:303-341`) re-runs the tool with its **originally validated arguments** — so a small local model can't corrupt the call on resume.
- From the CLI, `jerry --approve …` performs the ask-and-approve in a single command.

Tools without egress cost (`summarize_activity`, `search_memory`, `read_file`, `list_watched`, etc.) are **not** gated.
