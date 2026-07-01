# Cloud vendor update comparison
_Exported on 6/30/2026 at 19:58:55 EDT from Cursor (3.9.16)_

---

**User**

what's the diff between the cloud vendor update we made locally and the one that's acutally is on mieweb 

---

**Cursor**

I'll compare the local cloud vendor setup with what's configured on mieweb by reading the relevant config and vendor paths.


Checking the vendor/cloud submodule state and comparing it with upstream mieweb/cloud.


Here’s the comparison between your **local `vendor/cloud` submodule** and what’s on **upstream `mieweb/cloud`** (GitHub `main`).

## At a glance

| | **Local (Jerry)** | **On mieweb/cloud (`main`)** |
|---|---|---|
| **Commit** | `ecb8aa7` | `31330a4` |
| **Branch** | `feature/cloud-agent` (local only) | `main` |
| **Jerry pin** | Parent repo points submodule at `ecb8aa7` | — |
| **Remote branch** | Not pushed (`feature/cloud-agent` absent on origin) | — |

Your local submodule is **2 commits ahead** of upstream. Everything else in the repo (cli, cloud-local, cloud-os, test-app, etc.) matches what’s already on `main` at `31330a4`.

---

## What you added locally (not on mieweb yet)

Two new packages, ~**2,137 lines** across **16 files**:

### 1. `@mieweb/cloud-agent` (`c154c39`)
- `hostAgent()` — binds an agent definition + `AgentRuntime` to a Durable Object
- Session DO with queue-driven turns, suspend/resume, alarms
- Storage layer: sessions, events, messages, activity_events, summaries
- Tests in `storage.test.ts`

### 2. `@mieweb/cloud-agent-cli` (`c154c39`)
- Message-first CLI dispatcher (`--call` streaming, `-txt`/`--put` fire-and-forget)
- Parse tests, HTTP client, `bin/agent-cli.js`

### 3. Follow-up commit (`ecb8aa7`) — Jerry-specific ergonomics
This is the smaller diff on top of the initial packages:

- **`POST /messages` runs synchronously** — `--call` executes the turn inline instead of only enqueueing to `JOBS` (async path stays on `/enqueue`)
- **`createTools(ctx)` factory** — `hostAgent()` accepts an optional tool builder so Jerry can inject DB/vector/alarm-bound tools per turn
- **`profile` passthrough** — privacy profile from the request flows into `createRuntime(job.profile)` and `TurnJob`

Upstream `packages/README.md` on `main` still lists only `cloud-types`, `cloud-workers`, `cloud`, `cloud-local`, and `cli` — no `cloud-agent` or `cloud-agent-cli` rows.

---

## What is *not* different

The existing substrate on `main` is unchanged locally:

- `@mieweb/cli`, `@mieweb/cloud-local`, `@mieweb/cloud-os`
- test-app harness and adapters (libSQL, Valkey, S3, etc.)
- `mieweb init` scaffolder (`31330a4`)

So this isn’t a fork of the whole cloud repo — it’s **`main` + the cloud-agent work on a local branch**.

---

## How Jerry consumes it

Jerry’s `pnpm-workspace.yaml` includes `vendor/cloud/packages/*`, so Jerry resolves:

- `@mieweb/cloud-agent` → local submodule
- `@mieweb/cloud-agent-cli` → local submodule

Those packages are **not on npm** (404 on `@mieweb/cloud-agent`, `@mieweb/cloud`, `@mieweb/cli`). They only exist via the submodule / workspace link.

---

## If you meant the `mieweb` *target* config

That’s separate from the vendor update. Jerry’s root `mieweb.jsonc` `mieweb` target mirrors the pattern from `vendor/cloud/packages/test-app/mieweb.jsonc` / `cloud-os/mieweb.sample.jsonc` (libSQL + Valkey + MinIO), with Jerry-specific names:

- bucket: `mieweb-jerry-files` vs test-app’s `mieweb-test-app`
- queue: `mieweb-jerry-turns`
- namespace: `jerry`
- vectors table: `jerry_vectors`
- binding `SESSION` (inproc DO) instead of test-app’s `COUNTER`

The adapter drivers themselves (`libsql`, `valkey`, `s3`, `valkey-queue`, `libsql-vec`) are the same as upstream’s sample configs.

---

**Bottom line:** The only delta vs `mieweb/cloud` `main` is the unreleased **`feature/cloud-agent` branch** with two new packages and the second commit’s sync-turn + `createTools` changes. It hasn’t been pushed or merged upstream yet; Jerry is pinned to it locally so Phase 1 can build on top.

If you meant a different “on mieweb” (e.g. a deployed os.mieweb.org instance or an open PR), say which and we can compare that specifically.

