# Guide to operating Jerry
_Exported on 6/30/2026 at 19:58:05 EDT from Cursor (3.9.16)_

---

**User**

write me a guide on how to operate jerry right now. 

---

**Cursor**

I'll explore the repo docs, config, and run scripts to put together an accurate guide for operating Jerry as it stands today.


# How to Operate Jerry (Right Now)

Jerry is a **local-first, event-driven agent** that reads your activity signals (mainly ActivityWatch) and turns them into a narrative about the value of your work. At this stage it runs as three cooperating pieces on your laptop: a **worker** (the brain), a **collector** (activity ingest), and a **CLI** (how you talk to it).

---

## What you need installed

| Requirement | Version / notes |
|---|---|
| **Node.js** | ≥ 22.16.0 |
| **pnpm** | 10.17.1 (via corepack) |
| **Ollama** | Local LLM — required for real replies |
| **ActivityWatch** | Optional but recommended — runs on `localhost:5600` |

---

## One-time setup

From the repo root:

```bash
git submodule update --init --recursive
pnpm install
```

Pull a **tool-capable** Ollama model (Jerry calls tools like `summarize_activity`; chat-only models won't work):

```bash
# Default family (recommended)
OLLAMA_DOWNLOAD_PARTS=1 ollama pull qwen2.5:3b

# Alternatives that also support tools
OLLAMA_DOWNLOAD_PARTS=1 ollama pull llama3.2:3b
```

If `ollama pull` fails with `EOF`, use `OLLAMA_DOWNLOAD_PARTS=1`, try a different network, or restart the Ollama app.

**Do not use `gemma3:4b`** — it can chat but Ollama reports it does not support tools, which Jerry needs.

---

## The three-process workflow

Jerry works best with up to three terminals:

```
┌─────────────────┐     POST /v1/events      ┌──────────────────┐
│  Collector      │ ───────────────────────► │  Jerry Worker    │
│  (ActivityWatch │                          │  localhost:8787  │
│   + folders)    │                          │  SQLite + DO     │
└─────────────────┘                          └────────▲─────────┘
                                                    │
                              POST /v1/sessions/.../messages
                                                    │
                                            ┌───────┴────────┐
                                            │  jerry CLI     │
                                            │  (your prompts)│
                                            └────────────────┘
```

### Terminal 1 — Start the worker

```bash
pnpm dev
```

This kills anything on port 8787, then starts the Jerry worker at **http://localhost:8787** using the `local` target (SQLite + in-memory cache, no external services).

Verify:

```bash
curl http://localhost:8787/health
```

Expected response:

```json
{"ok":true,"agent":"jerry","package":"@mieweb/jerry-app","status":"ok"}
```

If you see only `{"status":"ok","package":"..."}` or get 404 on `/v1/*`, something old is still on 8787 — kill it and restart.

Local data is stored under:

- `.data/local/d1.sqlite` — sessions, events, activity, summaries
- `.data/local/files/` — file bucket
- `.data/local/vectors.sqlite` — semantic memory index

---

### Terminal 2 — Start the collector (for real activity data)

ActivityWatch must be running on `localhost:5600`. Then:

```bash
pnpm --filter @mieweb/jerry-collector dev
```

Optional: watch folders for screenshots/notes:

```bash
pnpm --filter @mieweb/jerry-collector dev -- --watch ~/Screenshots --watch ~/Notes
```

The collector polls ActivityWatch every 30 seconds (configurable) and POSTs events to the worker. Without it, Jerry can still reply, but `summarize_activity` will have little or no data.

---

### Terminal 3 — Talk to Jerry

The `jerry` binary isn't globally linked yet. From the repo root:

```bash
JERRY_MODEL=ollama:qwen2.5:3b NODE_OPTIONS='--import tsx' node packages/cli/bin/jerry.js summarize my last 2 hours
```

Shorter alias pattern — set model once per shell:

```bash
export JERRY_MODEL=ollama:qwen2.5:3b
export NODE_OPTIONS='--import tsx'
node packages/cli/bin/jerry.js how is my day going
```

---

## CLI usage

### Basic commands

| Command | What it does |
|---|---|
| `jerry <message>` | Send a message, stream reply to stdout (default) |
| `jerry -txt <message>` | Enqueue and exit immediately (fire-and-forget) |
| `jerry --debug <message>` | Same as above, plus tool-call logging on stderr |
| `jerry --help` | Show help |
| `jerry --config` | Dump resolved config (URL + profile) |
| `jerry --version` | Show version |

### Example prompts

```bash
node packages/cli/bin/jerry.js summarize my last 2 hours
node packages/cli/bin/jerry.js how is my day going
node packages/cli/bin/jerry.js -txt quick note for the day
node packages/cli/bin/jerry.js --debug what did I work on this morning
```

### Continuing a suspended session

If Jerry needs input, the CLI prints something like:

```
[waiting_for_user] ...
Session: session-1730...
```

Resume with:

```bash
JERRY_SESSION=session-1730... node packages/cli/bin/jerry.js yes go ahead
```

---

## What Jerry can do today (Phase 1 MVP)

Jerry has three wired tools:

| Tool | Purpose |
|---|---|
| `summarize_activity` | Reads ActivityWatch data from the DB, builds focus blocks / metrics, writes a summary |
| `search_memory` | Semantic search over indexed documents (footnote vectors) |
| `schedule_followup` | Schedules a DO alarm for a future reminder |

**Typical end-to-end flow** for "how is my day going":

1. You send the message via CLI
2. Jerry calls `summarize_activity` (reads collector-pushed AW data)
3. Jerry turns the summary into a value narrative
4. CLI prints the reply and exits

Use `--debug` to watch tool calls:

```bash
JERRY_MODEL=ollama:qwen2.5:3b NODE_OPTIONS='--import tsx' \
  node packages/cli/bin/jerry.js --debug summarize my last 2 hours
```

You'll see lines like `[tool] summarize_activity(...)` on stderr.

---

## Configuration

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `JERRY_URL` | `http://127.0.0.1:8787` | Worker URL (CLI + collector) |
| `JERRY_MODEL` | `ollama:qwen2.5` | Override LLM (e.g. `ollama:llama3.2:3b`) |
| `JERRY_RUNTIME` | `local` | Runtime backend (only `local` works today) |
| `JERRY_SESSION` | auto-generated | Resume a specific session |
| `AW_URL` | `http://localhost:5600` | ActivityWatch API (collector) |
| `POLL_INTERVAL` | `30000` | AW poll interval in ms (collector) |

### Config files (optional)

The CLI reads these in order (later files override earlier):

- `./.jerry.json`
- `./.jerry/config.json`
- `~/.config/jerry/config.json`
- `~/.jerry.json`

Example `~/.jerry.json`:

```json
{
  "url": "http://127.0.0.1:8787",
  "profile": {
    "model": "ollama:qwen2.5:3b"
  }
}
```

### Default privacy profile

Jerry defaults to **fully local** operation:

- Runtime: `local` (in-process loop → Ollama at `127.0.0.1:11434`)
- Model: `ollama:qwen2.5`
- Egress: `deny` (nothing leaves your machine)

---

## HTTP API (if you want to call directly)

| Route | Method | Purpose |
|---|---|---|
| `/health` | GET | Liveness check |
| `/v1/sessions/:id/messages` | POST | Sync chat turn |
| `/v1/sessions/:id/enqueue` | POST | Async enqueue |
| `/v1/sessions/:id/status` | GET | Session state |
| `/v1/events` | POST | Push activity events (collector uses this) |

Example — push fake activity data without ActivityWatch:

```bash
curl -X POST http://localhost:8787/v1/events \
  -H "Content-Type: application/json" \
  -d '[{"source":"aw","occurredAt":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
       "payload":{"bucketId":"aw-watcher-window_test","events":[
         {"timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'","duration":3600,
          "data":{"app":"Cursor","title":"jerry phase 1"}}
       ]}}]'
```

Then ask Jerry to summarize.

---

## Troubleshooting

### CLI prints nothing and exits

- Check the worker is running: `curl localhost:8787/health`
- Check Ollama is running: `ollama list`
- Check the model exists and supports tools

### `model 'qwen2.5' not found`

Pull it, or override:

```bash
JERRY_MODEL=ollama:llama3.2:3b node packages/cli/bin/jerry.js ...
```

### `does not support tools` (Gemma 3)

Switch to `qwen2.5:3b` or `llama3.2:3b`.

### Jerry talks about gathering data but doesn't actually summarize

Usually one of:

- Collector not running → no AW data in DB
- Wrong model (no tool support)
- Worker not restarted after code changes

Fix: restart `pnpm dev`, start collector, use a tool-capable model, retry with `--debug`.

### Port 8787 already in use

`pnpm dev` tries to kill the old process automatically. If that fails:

```bash
lsof -ti:8787 | xargs kill -9
pnpm dev
```

### Turn takes a long time

Normal for local 3B models — expect ~8–30 seconds per turn with tool calls.

---

## Running tests / CI locally

```bash
pnpm typecheck          # Type-check all packages
pnpm lint               # Lint
pnpm test               # Unit tests (no Ollama needed)
pnpm run ci             # Full CI suite (note: `pnpm ci` is reserved by pnpm)
```

With worker running:

```bash
JERRY_URL=http://127.0.0.1:8787 pnpm exec tsx --test test/integration/jerry.test.ts
./scripts/test-portability.sh local
```

Optional Ollama integration test:

```bash
JERRY_OLLAMA_TEST=1 JERRY_OLLAMA_MODEL=ollama:qwen2.5:3b \
  pnpm --filter @mieweb/jerry-agent-runtime test
```

---

## What's not available yet

| Feature | Status |
|---|---|
| `byo-cloud` / OpenAI / Groq runtime | Not implemented — throws error |
| Ozwell hosted runtime | Not implemented |
| `read_file` / `list_watched` tools | Deferred to Phase 2 |
| Web UI | No UI — CLI only |
| `--report` mode | Stub ("not yet implemented") |
| Cloudflare production deploy | Not wired |
| TimeHarbor / Pulse integration | Planned, not in Phase 1 |

---

## Quick-start cheat sheet

```bash
# Setup (once)
git submodule update --init --recursive && pnpm install
OLLAMA_DOWNLOAD_PARTS=1 ollama pull qwen2.5:3b

# Terminal 1 — worker
pnpm dev

# Terminal 2 — collector (ActivityWatch must be running)
pnpm --filter @mieweb/jerry-collector dev

# Terminal 3 — talk to Jerry
export JERRY_MODEL=ollama:qwen2.5:3b
export NODE_OPTIONS='--import tsx'
node packages/cli/bin/jerry.js --debug summarize my last 2 hours
```

That's the full local operating loop for Jerry as it stands at the end of Phase 1: worker + collector + CLI, local Ollama, ActivityWatch data, and three tools wired end-to-end.

---

**User**

add this quick start cheat sheet at the top of @README.md @README.md:8 

---

**Cursor**

Added a **Quick start** section at the top of `README.md` with:

- A one-line overview of the three-process setup (worker, collector, CLI)
- The tool-capable model requirement
- Copy-paste commands for setup, all three terminals, and a health check
- A link to the running/troubleshooting doc for model and tool issues

It sits right above the existing **Development** section.

---

**User**

actually this readme update and push should be on Development branch 

---

**Cursor**

Checking git state and moving the README update onto the Development branch.


Diff looks correct. Committing and pushing to `development`.


Done. The README quick start section is on **`development`** and pushed to `origin/development`.

- **Commit:** `9cbb8e7` — `docs: add quick start cheat sheet to README`
- **Branch:** `development` (was previously uncommitted on `phase-1/event-host-mvp`)

You're currently checked out on `development` with a clean working tree. The change is not on `phase-1/event-host-mvp`; say if you want it cherry-picked there too.

