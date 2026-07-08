# Jerry — Command Manual

> **Jerry** is an event-driven agent that interprets your activity into a defensible narrative of value. This manual covers every command available in the monorepo, arranged in the order you would use them, with prerequisites called out explicitly.

---

## Table of Contents

1. [System Prerequisites](#1-system-prerequisites)
2. [One-Time Setup](#2-one-time-setup)
3. [Daily Development — Starting the Stack](#3-daily-development--starting-the-stack)
4. [Talking to Jerry — the CLI](#4-talking-to-jerry--the-cli)
5. [Code Quality — Typecheck, Lint, Test](#5-code-quality--typecheck-lint-test)
6. [CI Pipeline](#6-ci-pipeline)
7. [Integration & Portability Tests](#7-integration--portability-tests)
8. [Per-Package Commands](#8-per-package-commands)
9. [Infrastructure — mieweb Target (Self-Hosted)](#9-infrastructure--mieweb-target-self-hosted)
10. [Footnote — Doc Search & Indexing](#10-footnote--doc-search--indexing)
11. [OzwellAI TypeScript Client](#11-ozwellai-typescript-client)
12. [Template Updater](#12-template-updater)
13. [Phase 2 Slice 1 — Manual Acceptance Test](#13-phase-2-slice-1--manual-acceptance-test)
14. [HTTP API Reference (curl)](#14-http-api-reference-curl)
15. [Environment Variables](#15-environment-variables)
16. [Configuration Files](#16-configuration-files)
17. [Submodule Management](#17-submodule-management)

---

## 1. System Prerequisites

Before running any command in this repo, ensure all of the following are satisfied.

### Required

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | `>= 22.16.0` | Check with `node --version` |
| **pnpm** | `10.17.1` | Installed automatically via corepack if you have Node 22+. Check with `pnpm --version` |
| **Git submodules** | — | Must be initialised (see [One-Time Setup](#2-one-time-setup)) |

### Required to talk to Jerry

| Requirement | Details |
|-------------|---------|
| **Ollama** | Running locally at `http://127.0.0.1:11434`. A **tool-capable** model is required. Recommended: `qwen2.5:3b` or `llama3.2:3b`. **Do not use** `gemma3:4b` — it does not support tool calls. |
| **nomic-embed-text** (Phase 2+) | Ollama embedding model required for folder-watch indexing and semantic search. Pull with `ollama pull nomic-embed-text`. 768-dimensional vectors, ~274 MB. |

### Optional but recommended

| Requirement | Default URL | Purpose |
|-------------|-------------|---------|
| **ActivityWatch** | `http://localhost:5600` | Local activity data collection for the collector sidecar |

### For the `mieweb` self-hosted target only

| Requirement | Default Port |
|-------------|-------------|
| libSQL server | `:8080` |
| Valkey (Redis-compatible) | `:6379` |
| MinIO (S3-compatible) | `:9000` |
| Docker + Docker Compose | — |

---

## 2. One-Time Setup

Run these commands once after cloning. They must complete successfully before anything else will work.

### Step 1 — Initialise Git Submodules

```bash
git submodule update --init --recursive
```

This checks out three vendor submodules:

| Path | Upstream | Key packages |
|------|---------|-------------|
| `vendor/cloud` | `mieweb/cloud` | `@mieweb/cloud`, `@mieweb/cloud-agent`, `@mieweb/cloud-agent-cli`, `@mieweb/cli` |
| `vendor/footnote` | `mieweb/melvil-artipod-footnote` | `@mieweb/footnote` |
| `vendor/ozwellai-api` | `mieweb/ozwellai-api` | `ozwellai`, `@mieweb/ozwellai-spec` |

> **Note:** You must re-run this command whenever you pull changes that update a submodule SHA.

### Step 2 — Install Dependencies

```bash
pnpm install
```

Installs all workspace packages from the lockfile. The workspace includes 17 packages across `packages/` and `vendor/`.

### Step 3 — Pull an Ollama Model

```bash
OLLAMA_DOWNLOAD_PARTS=1 ollama pull qwen2.5:3b
```

- `OLLAMA_DOWNLOAD_PARTS=1` parallelises the download for speed.
- If you prefer a different model, substitute it here and set `JERRY_MODEL` accordingly when running the CLI (see [Environment Variables](#14-environment-variables)).
- Requires Ollama to be installed and running.

**Verify Ollama is running:**

```bash
curl http://127.0.0.1:11434
```

---

## 3. Daily Development — Starting the Stack

Jerry runs as three concurrent processes. Open three terminal windows.

### Terminal 1 — Worker (Agent Server)

**Prerequisite:** `pnpm install` complete.

```bash
pnpm dev
```

What this does:
1. **`predev`** — kills any existing process on port 8787 (`lsof -ti:8787 | xargs kill -9 2>/dev/null || true`)
2. Starts `@mieweb/jerry-app` in local mode: `NODE_OPTIONS='--import tsx' mieweb --target local dev`
3. Boots the `@mieweb/cloud-local` Node harness with SQLite for D1 and in-memory KV
4. Serves the worker on `http://localhost:8787`

**Verify the worker is up:**

```bash
curl http://localhost:8787/health
# Expected: {"status":"ok","package":"@mieweb/jerry-app"}
```

---

### Alternative: Cloudflare / Miniflare (dev only)

```bash
pnpm --filter @mieweb/jerry-app dev:cf
```

Runs `mieweb dev` which delegates to real `wrangler` (Miniflare). Requires `wrangler` to be installed and `wrangler.jsonc` to be configured. Uses Cloudflare-local bindings (D1, KV, R2, Queues, Durable Objects, Vectorize).

---

### Terminal 2 — Collector Sidecar

**Prerequisite:** ActivityWatch running on `http://localhost:5600`.

```bash
pnpm --filter @mieweb/jerry-collector dev
```

What this does:
- Runs `tsx src/cli.ts` inside `packages/collector`
- Polls ActivityWatch at `$AW_URL` (default `http://localhost:5600`) every `$POLL_INTERVAL` ms (default `30000`)
- Watches folders for file changes via `chokidar`
- POSTs events to `$JERRY_URL/v1/events` (default `http://127.0.0.1:8787/v1/events`)

**CLI flags (pass after `--`):**

```bash
pnpm --filter @mieweb/jerry-collector dev -- \
  --watch /path/to/folder \
  --aw-url http://localhost:5600 \
  --jerry-url http://127.0.0.1:8787 \
  --poll-interval 15000
```

| Flag | Alias | Default | Description |
|------|-------|---------|-------------|
| `--watch` | `-w` | — | Additional folder path to watch for changes |
| `--aw-url` | — | `http://localhost:5600` | ActivityWatch base URL |
| `--jerry-url` | — | `http://127.0.0.1:8787` | Jerry worker base URL |
| `--poll-interval` | — | `30000` | ActivityWatch poll interval in milliseconds |
| `--help` | — | — | Show help text |

---

### Terminal 3 — Talk to Jerry

**Prerequisite:** Worker running on `:8787`, Ollama running with a tool-capable model.

```bash
export JERRY_MODEL=ollama:qwen2.5:3b
export NODE_OPTIONS='--import tsx'
node packages/cli/bin/jerry.js summarize my last 2 hours
```

See [Section 4](#4-talking-to-jerry--the-cli) for the full CLI reference.

---

## 4. Talking to Jerry — the CLI

The `jerry` CLI is a thin wrapper over `@mieweb/cloud-agent-cli`. It is **message-first**: arguments after any flags are joined as the message body.

**Binary:** `packages/cli/bin/jerry.js`

**Prerequisite:** `NODE_OPTIONS='--import tsx'` must be set in your environment, or the binary will fail to resolve TypeScript source files in the workspace.

```bash
export NODE_OPTIONS='--import tsx'
```

### Invocation Patterns

#### Send a message and stream the reply (default)

```bash
node packages/cli/bin/jerry.js summarize my last 2 hours
```

#### Send with debug output

```bash
node packages/cli/bin/jerry.js --debug summarize my last 2 hours
```

Prints full request/response metadata alongside the streamed reply.

#### Enqueue a message (fire-and-forget, no streaming wait)

```bash
node packages/cli/bin/jerry.js --put what did I work on today
# or equivalently:
node packages/cli/bin/jerry.js -txt what did I work on today
```

Enqueues the message and returns immediately without waiting for a response.

#### Resume a specific session

```bash
node packages/cli/bin/jerry.js --session <sessionId> continue from where we left off
# or short form:
node packages/cli/bin/jerry.js -s <sessionId> continue from where we left off
```

Pass a session ID to resume an existing conversation. Session IDs are returned or displayed when a session is created.

#### Show help

```bash
node packages/cli/bin/jerry.js --help
node packages/cli/bin/jerry.js -h
```

#### Show version

```bash
node packages/cli/bin/jerry.js --version
node packages/cli/bin/jerry.js -v
```

#### Show current config

```bash
node packages/cli/bin/jerry.js --config
```

Displays the resolved configuration Jerry is using (model, runtime, session, etc.). Useful for debugging misconfigured environments.

### CLI Flags Reference

| Flag | Alias | Description |
|------|-------|-------------|
| `--debug` | — | Enable debug/verbose output |
| `--put` | `-txt` | Enqueue message without waiting for a response |
| `--session <id>` | `-s <id>` | Resume a specific session by ID |
| `--help` | `-h` | Show help |
| `--version` | `-v` | Print version |
| `--config` | — | Print resolved config |
| `--report` | — | (Not yet implemented) |

### Config File Lookup Order

The CLI searches for a config file in this order (lowest to highest precedence):

1. `~/.jerry.json`
2. `~/.config/jerry/config.json`
3. `.jerry/config.json` (in current working directory)
4. `.jerry.json` (in current working directory)

The config file can override model, runtime, session ID, and egress policy.

---

## 5. Code Quality — Typecheck, Lint, Test

These commands run from the repo root and cover all workspace packages.

### Typecheck

**Prerequisite:** `pnpm install` complete.

```bash
pnpm typecheck
```

Runs `tsc --noEmit` against the root `tsconfig.json`, which includes `packages/` and excludes `vendor/`. No files are emitted — this is a pure type-safety check.

---

### Lint

**Prerequisite:** `pnpm install` complete.

```bash
pnpm lint
```

Runs `eslint .` with the root `eslint.config.js`. The `vendor/` directory and `dist/` folders are excluded. Uses `typescript-eslint` rules.

---

### Test — All Packages

**Prerequisite:** `pnpm install` complete.

```bash
pnpm test
```

Runs `pnpm -r --if-present test` — executes the `test` script in every workspace package that has one, in parallel. Each package runs its own test suite with `tsx --test src/**/*.test.ts` (or `node --test` for `cloud-local` and `cloud-os`).

---

### Test — Single Package

To run tests only for one package:

```bash
pnpm --filter @mieweb/jerry-tools test
pnpm --filter @mieweb/jerry-agent-runtime test
pnpm --filter @mieweb/jerry-app test
pnpm --filter @mieweb/jerry-cli test
pnpm --filter @mieweb/jerry-collector test
pnpm --filter @mieweb/cloud-agent test
pnpm --filter @mieweb/cloud-agent-cli test
pnpm --filter @mieweb/cloud-local test
pnpm --filter @mieweb/cloud-os test
pnpm --filter @mieweb/footnote test
```

---

### Ollama Integration Tests

Some tests in `packages/agent-runtime` and `packages/tools` require a live Ollama instance. They are skipped by default and opt-in via environment variable.

```bash
JERRY_OLLAMA_TEST=1 pnpm --filter @mieweb/jerry-agent-runtime test
JERRY_OLLAMA_TEST=1 pnpm --filter @mieweb/jerry-tools test
```

To specify which model to use for Ollama tests:

```bash
JERRY_OLLAMA_TEST=1 JERRY_OLLAMA_MODEL=ollama:qwen2.5 pnpm --filter @mieweb/jerry-agent-runtime test
```

---

## 6. CI Pipeline

### Run the full CI pipeline locally

**Prerequisite:** `pnpm install` complete (the script re-runs it with `--frozen-lockfile`).

```bash
pnpm run ci
```

> **Important:** Use `pnpm run ci`, not `pnpm ci`. The `pnpm ci` command is reserved by pnpm itself (currently unimplemented in most versions) and will not invoke the project script.

This executes `bash scripts/ci.sh`, which runs the following steps in order, stopping on first failure:

| Step | Command | What it checks |
|------|---------|----------------|
| 1 | `pnpm install --frozen-lockfile` | Lockfile is consistent, no unresolved deps |
| 2 | `pnpm typecheck` | TypeScript types are valid |
| 3 | `pnpm lint` | No ESLint violations |
| 4 | `pnpm test` | All package test suites pass |

This is the same script run by GitHub Actions on every push and PR to `main` and `development`.

### Run CI script directly

```bash
bash scripts/ci.sh
```

Equivalent to `pnpm run ci`.

---

## 7. Integration & Portability Tests

These tests start the worker, hit its HTTP API, and verify it responds correctly. They are separate from unit tests and require no external services for the `local` target.

### Run portability tests against the local target

```bash
./scripts/test-portability.sh local
```

What this does:
1. Kills any process on port 8787
2. Starts `pnpm --filter @mieweb/jerry-app dev` in the background
3. Polls `http://127.0.0.1:8787/health` up to 30 times (1 second apart) until ready
4. Runs three integration checks:
   - **Health check** — `GET /health` must return `{"ok":true,...}`
   - **Session status** — `GET /v1/sessions/{id}/status` must return a `sessionId` field
   - **Event ingestion** — `POST /v1/events` with a test payload must return `{"ok":true}`
5. Stops the worker and reports pass/fail

### Run portability tests against the mieweb target

**Prerequisite:** `@mieweb/cloud-os` Docker Compose services must be running (see [Section 9](#9-infrastructure--mieweb-target-self-hosted)).

```bash
./scripts/test-portability.sh mieweb
```

> Currently skipped in `all` mode until docker services are available in CI.

### Run all portability targets

```bash
./scripts/test-portability.sh all
# or with no argument (defaults to 'all'):
./scripts/test-portability.sh
```

Currently runs `local` only; `mieweb` is skipped with a warning until docker services are provisioned.

### Run integration tests manually (worker must already be running)

```bash
JERRY_URL=http://127.0.0.1:8787 pnpm exec tsx --test test/integration/jerry.test.ts
```

---

## 8. Per-Package Commands

Commands scoped to individual packages using pnpm's `--filter` flag.

### `@mieweb/jerry-app` — Worker

```bash
# Start worker in local mode (same as root `pnpm dev`)
pnpm --filter @mieweb/jerry-app dev

# Start worker against Cloudflare / Miniflare
pnpm --filter @mieweb/jerry-app dev:cf

# Run unit tests
pnpm --filter @mieweb/jerry-app test
```

### `@mieweb/jerry-collector` — Collector Sidecar

```bash
# Start the collector in dev mode
pnpm --filter @mieweb/jerry-collector dev

# Run unit tests
pnpm --filter @mieweb/jerry-collector test
```

### `@mieweb/jerry-agent-runtime` — Agent Runtime

```bash
# Run unit tests
pnpm --filter @mieweb/jerry-agent-runtime test

# Run with Ollama integration tests enabled
JERRY_OLLAMA_TEST=1 pnpm --filter @mieweb/jerry-agent-runtime test
```

### `@mieweb/jerry-tools` — Tools

```bash
# Run unit tests
pnpm --filter @mieweb/jerry-tools test

# Run with Ollama integration tests enabled
JERRY_OLLAMA_TEST=1 pnpm --filter @mieweb/jerry-tools test
```

### `@mieweb/jerry-cli` — CLI

```bash
# Run unit tests
pnpm --filter @mieweb/jerry-cli test
```

### `@mieweb/cloud-agent` — Cloud Agent

```bash
# Run unit tests
pnpm --filter @mieweb/cloud-agent test
```

### `@mieweb/cloud-agent-cli` — Cloud Agent CLI

```bash
# Run unit tests
pnpm --filter @mieweb/cloud-agent-cli test
```

### `@mieweb/cloud-local` — Local Adapters

```bash
# Run unit tests
pnpm --filter @mieweb/cloud-local test
```

### `@mieweb/cloud-os` — Self-Hosted (os.mieweb.org) Adapters

```bash
# Run unit tests
pnpm --filter @mieweb/cloud-os test

# Start infrastructure (libSQL + Valkey + MinIO via Docker Compose)
pnpm --filter @mieweb/cloud-os infra:up

# Tear down infrastructure (also removes volumes)
pnpm --filter @mieweb/cloud-os infra:down
```

### `@mieweb/ozwellai-spec` — OzwellAI Zod Spec

```bash
# Build TypeScript to dist/
pnpm --filter @mieweb/ozwellai-spec build

# Watch mode build
pnpm --filter @mieweb/ozwellai-spec dev

# Remove dist/
pnpm --filter @mieweb/ozwellai-spec clean
```

---

## 9. Infrastructure — mieweb Target (Self-Hosted)

The `mieweb` target uses real persistent services instead of SQLite/in-memory adapters.

### Step 1 — Start infrastructure services

**Prerequisite:** Docker and Docker Compose installed.

```bash
pnpm --filter @mieweb/cloud-os infra:up
```

Runs `docker compose up -d --wait` inside `vendor/cloud/packages/cloud-os`. Starts:
- **libSQL** (SQLite-compatible database) on `:8080`
- **Valkey** (Redis-compatible cache) on `:6379`
- **MinIO** (S3-compatible object storage) on `:9000`

### Step 2 — Start the worker with the mieweb target

```bash
MIEWEB_TARGET=mieweb pnpm --filter @mieweb/jerry-app dev
```

Or set the target in `mieweb.jsonc` and just run `pnpm dev`.

### Step 3 — Tear down infrastructure services

```bash
pnpm --filter @mieweb/cloud-os infra:down
```

Runs `docker compose down -v`. The `-v` flag also removes Docker volumes, so stored data is deleted.

---

## 10. Footnote — Doc Search & Indexing

`@mieweb/footnote` is a portable SQLite hybrid-index RAG tool (FTS5 + sqlite-vec) used by Jerry's tools package for semantic document search.

### Build

```bash
pnpm --filter @mieweb/footnote build
```

Compiles TypeScript to `dist/` and copies the `src/ui/` directory.

### Index documents (`docidx`)

```bash
pnpm --filter @mieweb/footnote docidx
# or use the binary directly:
node vendor/footnote/bin/docidx.js
```

Runs the document indexer (`tsx src/cli/main.ts`). Builds or updates the SQLite search index for your document corpus.

### Start the footnote CLI / ask interface

```bash
pnpm --filter @mieweb/footnote start
```

Runs `tsx src/cli/main.ts` interactively.

### Serve the footnote HTTP interface

```bash
pnpm --filter @mieweb/footnote serve
```

Builds the project then starts the HTTP server: `node dist/cli/ask.js --serve`.

### Start the MCP server

```bash
pnpm --filter @mieweb/footnote mcp
```

Runs `tsx src/cli/mcp.ts` — starts the Model Context Protocol server for tool-calling integration.

### Run tests

```bash
pnpm --filter @mieweb/footnote test
```

Runs `node --import tsx --test src/**/*.test.ts`.

---

## 11. OzwellAI TypeScript Client

The `ozwellai` client package lives in `vendor/ozwellai-api/clients/typescript`. It ships its own build pipeline.

### Build

```bash
pnpm --filter ozwellai build
```

Runs the full build pipeline in sequence:
1. `npm run clean` — removes `dist/`
2. `npm run build:esm` — compiles ESM output with `tsconfig.esm.json`
3. `npm run build:cjs` — compiles CJS output with `tsconfig.cjs.json` and writes `dist/cjs/package.json`
4. `npm run build:types` — emits declaration files with `tsconfig.types.json`

### Build individual targets

```bash
# ESM only
pnpm --filter ozwellai build:esm

# CJS only
pnpm --filter ozwellai build:cjs

# Type declarations only
pnpm --filter ozwellai build:types
```

### Watch mode (ESM)

```bash
pnpm --filter ozwellai dev
```

Runs `tsc -p tsconfig.esm.json --watch`.

### Clean

```bash
pnpm --filter ozwellai clean
```

Removes `dist/`.

### Test

```bash
pnpm --filter ozwellai test
```

Builds the package first, then runs `tsx --test test/client.test.ts`.

### Test with Deno

```bash
pnpm --filter ozwellai test:deno
```

Requires Deno to be installed. Runs `deno test --config deno.json --allow-net test/**/*.deno.test.ts`.

### Lint

```bash
pnpm --filter ozwellai lint
```

Runs `eslint src/**/*.ts`.

### Format

```bash
pnpm --filter ozwellai format
```

Runs `prettier --write src/**/*.ts`.

### Publish to JSR

```bash
pnpm --filter ozwellai publish:jsr
```

Publishes to the JSR registry using `jsr publish`. Requires JSR authentication.

---

## 12. Template Updater

`apply.sh` syncs project files from the upstream MIE Web open-source template. It is interactive and safe to run on an existing project.

```bash
bash apply.sh
```

For each template file it:
1. Fetches the remote version from `mieweb/template-mieweb-opensource`
2. If no local file exists, prompts to **create** or **skip**
3. If a local file exists and differs, prompts for **overwrite**, **append**, **merge-dedupe**, or **skip**

Files managed by this script:
- `.github/copilot-instructions.md` — GitHub Copilot coding instructions
- `.gitignore` — Standard Node.js gitignore

> The script requires internet access to fetch from GitHub. It modifies local files interactively and does not commit anything automatically.

---

## 13. Phase 2 Slice 1 — Manual Acceptance Test

This section walks through the full acceptance scenario for [PR #4](https://github.com/mieweb/jerry/pull/4): **drop a text file → collector detects it → file gets indexed → Jerry can search and find it**.

### Prerequisites for this test

All of the following must be true before starting:

- [ ] `pnpm install` complete (submodules initialised)
- [ ] Ollama running at `http://127.0.0.1:11434`
- [ ] Agent model pulled: `ollama pull qwen2.5:3b`
- [ ] Embedding model pulled: `ollama pull nomic-embed-text`
- [ ] A folder you control to use as the watched directory (e.g. `~/jerry-test-watch`)

```bash
# Verify both models are available
ollama list
# Should show both qwen2.5:3b and nomic-embed-text
```

---

### Step 1 — Create a watch folder

```bash
mkdir -p ~/jerry-test-watch
```

---

### Step 2 — Start the worker (Terminal 1)

```bash
pnpm dev
```

Wait until you see the worker is ready, then verify:

```bash
curl http://localhost:8787/health
# Expected: {"status":"ok","package":"@mieweb/jerry-app"}
```

---

### Step 3 — Start the collector with the watch folder (Terminal 2)

```bash
pnpm --filter @mieweb/jerry-collector dev -- --watch ~/jerry-test-watch
```

Expected output:

```
Jerry Collector
===============
AW URL: http://localhost:5600
Jerry URL: http://127.0.0.1:8787
Poll interval: 30000ms
Watch paths: /Users/<you>/jerry-test-watch

Collector running. Press Ctrl+C to stop.
Starting folder watcher for: /Users/<you>/jerry-test-watch
```

> ActivityWatch does not need to be running for this test. The collector will log AW poll errors but continue watching the folder.

---

### Step 4 — Drop a text file into the watch folder

```bash
cat > ~/jerry-test-watch/my-notes.txt << 'EOF'
Meeting notes from the architecture review session.
We decided to use SQLite with sqlite-vec for local vector storage.
The footnote submodule provides the embedding infrastructure.
Key action: integrate nomic-embed-text for semantic search.
EOF
```

**What should happen in the collector terminal (Terminal 2):**

```
Pushed created event for: my-notes.txt
Indexed for search: my-notes.txt
```

The two lines confirm:
1. `Pushed created event` — file event sent to `POST /v1/events`
2. `Indexed for search` — content uploaded to `PUT /v1/files/...` and indexed via `POST /v1/index`

If you see `Indexing skipped: ...` instead of `Indexed for search`, check that `nomic-embed-text` is pulled and Ollama is running.

---

### Step 5 — Verify the file was ingested (optional curl checks)

Check the event was stored:

```bash
curl -s -X POST http://localhost:8787/v1/sessions/test-verify/messages \
  -H "Content-Type: application/json" \
  -d '{"content":"list all watched files you know about"}'
```

Or directly trigger indexing of a second test document via HTTP:

```bash
curl -X POST http://localhost:8787/v1/index \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/tmp/test-doc.txt",
    "content": "This is a manually indexed test document about vector databases.",
    "metadata": {"source": "manual-test", "title": "test-doc.txt"}
  }'
# Expected: {"indexed":true,"id":"doc_...","path":"/tmp/test-doc.txt","embeddingDimensions":768}
```

A response with `"embeddingDimensions":768` confirms Ollama + `nomic-embed-text` are working correctly.

---

### Step 6 — Ask Jerry to search for the file (Terminal 3)

```bash
export JERRY_MODEL=ollama:qwen2.5:3b
export NODE_OPTIONS='--import tsx'
node packages/cli/bin/jerry.js search my notes about sqlite and vector storage
```

Jerry will use the `search_memory` tool internally. Expected behaviour:

- Jerry calls `search_memory` with a query derived from your message
- The tool generates an embedding and queries the vector index
- Returns the `my-notes.txt` document with a relevance score
- Jerry summarises what it found

**A successful response looks like:**

```
I found a document in your indexed notes:

**my-notes.txt** (relevance: 0.87)
"Meeting notes from the architecture review session. We decided to use SQLite 
with sqlite-vec for local vector storage..."
```

---

### Step 7 — Ask Jerry to read the file directly

```bash
node packages/cli/bin/jerry.js read the file at ~/jerry-test-watch/my-notes.txt
```

Jerry will use the `read_file` tool to retrieve the raw content from bucket storage.

---

### Step 8 — Ask Jerry to list watched files

```bash
node packages/cli/bin/jerry.js what files have you captured from the folder watcher
```

Jerry will call the `list_watched` tool, querying activity events with source `folder`, `screenshot`, or `folder-watcher`.

---

### Acceptance Checklist

Use this to check off the PR acceptance criteria:

- [ ] `read_file` and `list_watched` tools respond without error
- [ ] `index_document` tool returns `"embeddingDimensions":768` (real embeddings, not random vectors)
- [ ] `search_memory` returns the dropped file with a meaningful relevance score
- [ ] Collector logs `Indexed for search: my-notes.txt` when the file is dropped
- [ ] Unit tests pass: `pnpm --filter @mieweb/jerry-tools test && pnpm --filter @mieweb/jerry-collector test`
- [ ] **Acceptance scenario verified manually** ← this section completes this item

---

### Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `Indexing skipped: Could not generate embedding` | `nomic-embed-text` not pulled | `ollama pull nomic-embed-text` |
| `Indexing skipped: Ollama may not be running` | Ollama not started | Start Ollama app or `ollama serve` |
| `Indexing failed: 404` | Worker `/v1/index` endpoint not yet wired | The endpoint is invoked by the `index_document` tool; confirm the worker is running on `:8787` |
| Collector shows no output on file drop | File extension not watched | Only `.txt`, `.md`, `.json` (text) and `.png`, `.jpg`, `.gif`, `.webp` (images) are watched by default |
| File too large | Files over 100 KB are skipped by `shouldIndex()` | Use a smaller test file |
| Jerry says "Vector search is not available" | `VECTORS` binding not configured | Confirm you're running `pnpm dev` (local target with sqlite-vec), not a bare `node` invocation |

---

## 14. HTTP API Reference (curl)

These are direct HTTP calls to the running Jerry worker. The worker must be started first (see [Section 3](#3-daily-development--starting-the-stack)).

### Health check

```bash
curl http://localhost:8787/health
# Response: {"status":"ok","package":"@mieweb/jerry-app"}
```

### Get session status

```bash
curl http://localhost:8787/v1/sessions/<sessionId>/status
# Response: {"sessionId":"...","status":"..."}
```

Creates the session if it does not already exist.

### Send a message to a session (streaming)

```bash
curl -N -X POST http://localhost:8787/v1/sessions/<sessionId>/messages \
  -H "Content-Type: application/json" \
  -d '{"content":"summarize my last 2 hours"}'
```

`-N` disables output buffering for streaming responses.

### Ingest events

```bash
curl -X POST http://localhost:8787/v1/events \
  -H "Content-Type: application/json" \
  -d '[{"source":"test","occurredAt":"2026-07-07T13:00:00Z","payload":{"test":true}}]'
# Response: {"ok":true}
```

Accepts an array of event objects. Each object must have `source`, `occurredAt` (ISO 8601), and `payload`.

### Upload a file to bucket storage (Phase 2+)

```bash
curl -X PUT http://localhost:8787/v1/files/$(python3 -c "import urllib.parse; print(urllib.parse.quote('/path/to/my-notes.txt', safe=''))") \
  -H "Content-Type: text/plain" \
  --data-binary @/path/to/my-notes.txt
```

Or with a literal encoded path:

```bash
curl -X PUT "http://localhost:8787/v1/files/%2FUsers%2Fme%2Fnotes.txt" \
  -H "Content-Type: text/plain" \
  -d "My meeting notes from today..."
```

Stores raw file content in bucket storage under the given path key.

### Trigger document indexing (Phase 2+)

```bash
curl -X POST http://localhost:8787/v1/index \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/Users/me/notes.txt",
    "content": "My meeting notes from today...",
    "metadata": {
      "source": "manual",
      "title": "notes.txt"
    }
  }'
```

Generates an embedding via Ollama (`nomic-embed-text`) and upserts the vector into the index. Requires Ollama running with `nomic-embed-text` pulled. Also stores content in bucket if the bucket binding is available.

---

## 15. Environment Variables

Set these in your shell or a `.env` loader before running commands.

### Jerry Application

| Variable | Default | Description |
|----------|---------|-------------|
| `JERRY_URL` | `http://127.0.0.1:8787` | Base URL of the Jerry worker. Used by CLI, collector, and integration tests. |
| `JERRY_MODEL` | `ollama:qwen2.5:3b` (via default profile) | Model reference in `provider:model` format. |
| `JERRY_RUNTIME` | `local` | Agent runtime backend. |
| `JERRY_EGRESS` | `deny` | Network egress policy for the agent. |
| `JERRY_SESSION` | — | Override the session ID used by the CLI. |
| `NODE_OPTIONS` | — | Must be set to `'--import tsx'` when using the CLI or `jerry-app dev`. |

### Collector

| Variable | Default | Description |
|----------|---------|-------------|
| `AW_URL` | `http://localhost:5600` | ActivityWatch API base URL. |
| `POLL_INTERVAL` | `30000` | ActivityWatch poll interval in milliseconds. |

### Ollama Integration Tests

| Variable | Default | Description |
|----------|---------|-------------|
| `JERRY_OLLAMA_TEST` | — | Set to `1` to enable Ollama integration tests. |
| `JERRY_OLLAMA_MODEL` | `ollama:qwen2.5` | Model to use for Ollama integration tests. |

### mieweb CLI / Infrastructure

| Variable | Default | Description |
|----------|---------|-------------|
| `MIEWEB_TARGET` | (from `mieweb.jsonc`) | Override the deployment target: `cloudflare`, `local`, or `mieweb`. |
| `MIEWEB_REAL_WRANGLER` | — | Path to the real `wrangler` binary (escape hatch for the `mieweb` CLI wrapper). |

### Target Resolution Order (mieweb CLI)

The active target is resolved in this priority order (highest first):

1. `--target <value>` CLI flag
2. `MIEWEB_TARGET` environment variable
3. `target` field in `mieweb.jsonc`
4. Default: `cloudflare`

---

## 16. Configuration Files

| File | Purpose |
|------|---------|
| `mieweb.jsonc` | Target configuration. Defines `local` (default, SQLite + in-memory KV) and `mieweb` (libSQL + Valkey + MinIO) adapter bindings. |
| `wrangler.jsonc` | Cloudflare bindings: D1, KV, R2, Queues, Durable Objects, Vectorize, AI. Used when target is `cloudflare`. |
| `tsconfig.json` | Root TypeScript config. Extends `tsconfig.base.json`, includes `packages/`, excludes `vendor/`. |
| `tsconfig.base.json` | Shared strict TS config. ES2022, `bundler` resolution, `noEmit`. |
| `eslint.config.js` | ESLint config using `typescript-eslint`. Ignores `vendor/`, `dist/`, test files. |
| `pnpm-workspace.yaml` | Workspace package globs. Includes `packages/*`, `vendor/cloud/packages/*` (except `test-app`), `vendor/footnote`, and the OzwellAI spec and TS client. |

---

## 17. Submodule Management

Vendor submodules in `vendor/` are managed as Git submodules pointing to upstream repositories.

### Update all submodules to their pinned SHAs

```bash
git submodule update --init --recursive
```

Run this after every `git pull` when submodule SHAs change.

### Develop a feature inside a submodule

```bash
cd vendor/cloud
git checkout -b feature/my-change
# ... make changes, commit, push to upstream ...
cd ../..
git add vendor/cloud
git commit -m "chore: bump vendor/cloud to feature/my-change"
```

Committing the updated submodule SHA in the parent repo pins it for all contributors.

### Check submodule status

```bash
git submodule status
```

Shows the current SHA, working tree state, and branch (if any) for each submodule.

---

## Quick Reference Card

```
# First-time setup
git submodule update --init --recursive
pnpm install
OLLAMA_DOWNLOAD_PARTS=1 ollama pull qwen2.5:3b

# Daily dev (3 terminals)
pnpm dev                                          # Terminal 1: worker on :8787
pnpm --filter @mieweb/jerry-collector dev         # Terminal 2: collector sidecar

export JERRY_MODEL=ollama:qwen2.5:3b              # Terminal 3: CLI
export NODE_OPTIONS='--import tsx'
node packages/cli/bin/jerry.js summarize my day

# Health check
curl http://localhost:8787/health

# Quality gates
pnpm typecheck
pnpm lint
pnpm test
pnpm run ci   # all three + install

# Integration tests (worker must be running)
./scripts/test-portability.sh local

# Infrastructure (mieweb target)
pnpm --filter @mieweb/cloud-os infra:up
pnpm --filter @mieweb/cloud-os infra:down
```
