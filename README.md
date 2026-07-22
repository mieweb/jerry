_Working Backwards: Jerry \- the Ozwell Agent Agent for Knowledge Workers_

Introducing Jerry: The Ozwell Agent That Explains Your Work—So You Don’t Have To

---

## Quick start

Jerry runs as three local processes: **worker** (agent), **collector** (ActivityWatch ingest), and **CLI** (your prompts). You need a **tool-capable** Ollama model (`qwen2.5:3b` or `llama3.2:3b` — not `gemma3:4b`) for the default **local** runtime (and for Ozwell fallback).

```bash
# Setup (once)
git submodule update --init --recursive && pnpm install
OLLAMA_DOWNLOAD_PARTS=1 ollama pull qwen2.5:3b

# Terminal 1 — worker
pnpm dev

# Terminal 2 — collector (ActivityWatch must be running on localhost:5600)
pnpm --filter @mieweb/jerry-collector dev

# Terminal 3 — talk to Jerry (see runtime backends below)
alias jerry='NODE_OPTIONS="--import tsx" node packages/cli/bin/jerry.js'
jerry --debug summarize my last 2 hours
```

Verify the worker: `curl http://localhost:8787/health`

See [docs/chats/chat8 - running_the_program.md](docs/chats/chat8%20-%20running_the_program.md) for troubleshooting (model selection, tool errors, session resume).

### Runtime backends (`local` / `ozwell` / `byo-cloud`)

Jerry keeps the same tool loop (ActivityWatch, search, etc.) for all three. Only the **model endpoint** changes. Set profile via env vars (or `.jerry.json`).

Default local model is `ollama:qwen2.5` in `packages/agent-runtime/src/profile.ts` (`DEFAULT_PRIVACY_PROFILE`). Override with `JERRY_MODEL`.

```bash
# Shared CLI helper (from repo root)
alias jerry='NODE_OPTIONS="--import tsx" node packages/cli/bin/jerry.js'
# Worker must be running: pnpm dev
```

#### 1. Local (Ollama) — default

Nothing leaves the machine except localhost Ollama.

```bash
JERRY_RUNTIME=local \
  JERRY_MODEL=ollama:qwen2.5:3b \
  jerry "summarize my work from July 13th"
```

Omit `JERRY_RUNTIME` for the same default.

#### 2. Ozwell (Manager host)

Uses Ozwell as the cloud model (`https://ozwellapi.os.mieweb.org` by default). Prefer a parent key (`ozw_…`).

```bash
# Recommended: parent key so Jerry's local tools (summarize_activity, …) work
unset OZWELL_AGENT_KEY   # important if you previously exported an agnt_key-

JERRY_RUNTIME=ozwell \
  JERRY_MODEL=gpt-4.1-mini \
  OZWELL_API_KEY=ozw_your_key \
  jerry "summarize my work from July 13th"
```

Notes:

- **Prefer `OZWELL_API_KEY=ozw_…`**. Agent keys (`agnt_key-` / `OZWELL_AGENT_KEY`) bind an Ozwell-side agent persona and often skip Jerry tools (“please provide ActivityWatch data”).
- Optional endpoint: `OZWELL_ENDPOINT=https://ozwellapi.os.mieweb.org` (Manager host; not `tryozwell` UI or `api.ozwell.ai` unless your keys live there).
- If Ozwell is down or the key is bad, Jerry prints `[jerry] Ozwell unavailable…` and **falls back to local Ollama**.

```bash
# Force fallback path (expect notice + local Ollama)
JERRY_RUNTIME=ozwell OZWELL_API_KEY=ozw_bad jerry "hello"
```

#### 3. BYO-cloud (your OpenAI-compatible endpoint)

Same AI SDK loop; model URL form is `https://host/v1#modelId`.

```bash
JERRY_RUNTIME=byo-cloud \
  JERRY_MODEL='https://api.openai.com/v1#gpt-4o' \
  OPENAI_API_KEY=sk-... \
  jerry "summarize my work from July 13th"
```

`JERRY_API_KEY` works as an alternative to `OPENAI_API_KEY`.

| Variable | Used by | Purpose |
| -------- | ------- | ------- |
| `JERRY_RUNTIME` | all | `local` \| `ozwell` \| `byo-cloud` |
| `JERRY_MODEL` | all | Model ref (`ollama:…`, Ozwell id, or `https://…#model`) |
| `JERRY_EGRESS` | all | `deny` \| `allow-model` \| `allow-tools` (cloud runtimes auto-upgrade `deny` → `allow-model`) |
| `OZWELL_API_KEY` | ozwell | Parent key (`ozw_…`) — preferred |
| `OZWELL_AGENT_KEY` | ozwell | Agent key (`agnt_key-`) — not recommended for Jerry tools |
| `OZWELL_ENDPOINT` | ozwell | Default Manager host if unset |
| `OPENAI_API_KEY` / `JERRY_API_KEY` | byo-cloud | API key for your endpoint |

Package-level API details: [`packages/agent-runtime/README.md`](packages/agent-runtime/README.md). Phase 2 Slice 4 notes: [`docs/plans/phase-2.md`](docs/plans/phase-2.md).

### Use Jerry as an MCP server (Cursor / Claude Desktop)

Jerry exposes `summarize_activity`, `search_memory`, and `schedule_followup` over the [Model Context Protocol](https://modelcontextprotocol.io). The worker must be running (`pnpm dev`); the CLI speaks MCP over stdio and forwards tool calls to the worker's `/v1/mcp` endpoint.

```bash
# Terminal 1 — worker (required)
pnpm dev

# Optional: run the stdio MCP bridge directly
export NODE_OPTIONS='--import tsx'
node packages/cli/bin/jerry-mcp.js
```

Add to Cursor (`~/.cursor/mcp.json` or `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "jerry": {
      "command": "node",
      "args": ["packages/cli/bin/jerry-mcp.js"],
      "env": { "JERRY_URL": "http://127.0.0.1:8787" }
    }
  }
}
```

Full setup, HTTP transport, and limitations: [docs/mcp-server.md](docs/mcp-server.md). Command reference: [docs/manual.md §18](docs/manual.md#18-phase-2-slice-3--mcp-expose).

### jerry-term: Interactive Terminal UI

`jerry-term` is a standalone CLI with an OpenTUI-based terminal UI. It bundles all Jerry packages and works without running the worker.

```bash
# Development mode (from repo root)
pnpm --filter jerry-term dev

# Or when published:
npm i -g jerry-term
jerry-term
```

**UI Layout:**

```
┌─────────────────────────────────────────────────────────────────┐
│ ● jerry-term v0.1.0                  [local] ollama:qwen2.5:3b  │
├─────────────────────────────────────────────────────────────────┤
│ Based on your ActivityWatch data, you spent most of your time  │
│ in VS Code working on the jerry-term project...                │
├─────────────────────────────────────────────────────────────────┤
│ > _                                                             │
├─────────────────────────────────────────────────────────────────┤
│ ● Connected • Last: 2.3s • Tools: 6                            │
└─────────────────────────────────────────────────────────────────┘
```

**Built-in Commands:**

| Command | Description |
|---------|-------------|
| `/runtime <local\|ozwell\|byo-cloud>` | Switch runtime backend |
| `/health` | Run system health checks |
| `/aw-tail [limit] [bucket]` | Peek latest ActivityWatch events |
| `/config [key] [value]` | View or update configuration |
| `/help` | Show available commands |
| `/exit` | Exit the CLI |

**Keyboard Shortcuts:**

- `↑`/`↓` — Command history
- `Ctrl+L` — Clear transcript
- `Ctrl+C` — Cancel turn or exit

**Environment Variables:**

Same as the main CLI (`JERRY_RUNTIME`, `JERRY_MODEL`, `OZWELL_API_KEY`, etc.). jerry-term also reads config from `~/.config/jerry-term/config.json`.

Full documentation: [`packages/jerry-term/README.md`](packages/jerry-term/README.md)

---

## Development

### Prerequisites

- **Node.js** >= 22.16.0
- **pnpm** 10.17.1 (will be installed automatically via corepack if you have Node 22+)

### Setup

```bash
# Clone with submodules
git clone --recurse-submodules https://github.com/mieweb/jerry.git
cd jerry

# Or if already cloned:
git submodule update --init --recursive

# Install dependencies
pnpm install
```

### Commands

```bash
pnpm typecheck   # Type-check all packages
pnpm lint        # Lint all packages
pnpm test        # Run tests in all packages
pnpm run ci      # Run full CI locally (same as GitHub Actions)
                 # Note: use `run` — pnpm reserves `pnpm ci` for its own (unimplemented) command
```

### Repository layout

See [plan.md §6](plan.md) for architecture details.

```
packages/
  jerry-app/     # Worker: fetch/queue/scheduled + AgentSession DO
  jerry-term/    # Standalone terminal CLI with OpenTUI UI
  tools/         # AW aggregation, footnote, file tools
  collector/     # Local sidecar: folder watch + AW poll
  cli/           # Message-first CLI (jerry binary)
vendor/          # Git submodules: @mieweb/cloud, footnote, ozwellai-api
```

### Vendor submodules

Platform dependencies live in `vendor/` as git submodules for co-evolution (see [plan.md §9](plan.md)):

| Path                  | Upstream                                                                            | Key packages                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `vendor/cloud`        | [mieweb/cloud](https://github.com/mieweb/cloud)                                     | `@mieweb/cloud`, `@mieweb/cloud-agent`, `@mieweb/cloud-agent-cli`, `@mieweb/cli`, cloud-local/os/types/workers |
| `vendor/footnote`     | [mieweb/melvil-artipod-footnote](https://github.com/mieweb/melvil-artipod-footnote) | `@mieweb/footnote`                                                                                             |
| `vendor/ozwellai-api` | [mieweb/ozwellai-api](https://github.com/mieweb/ozwellai-api)                       | `ozwellai`, `@mieweb/ozwellai-spec`                                                                            |

After cloning or pulling, ensure submodules are initialized:

```bash
git submodule update --init --recursive
```

To develop upstream features, work on a branch inside the submodule:

```bash
cd vendor/cloud
git checkout -b feature/my-change
# make changes, commit, push to upstream
# then in jerry root, commit the new submodule SHA
```

**Active upstream PR:** [`@mieweb/cloud-agent`](https://github.com/mieweb/cloud/pull/1) — Jerry develops on `vendor/cloud` branch `feature/cloud-agent` (pinned `ecb8aa7`) until merged to `mieweb/cloud` `main`. Track progress in [docs/plans/phase-1.md](docs/plans/phase-1.md).

### Local development

Start the Jerry worker on the local harness (SQLite + in-memory KV, no external services):

```bash
pnpm dev
```

This runs on `http://localhost:8787`. Verify with:

```bash
curl localhost:8787/health
# {"status": "ok", "package": "@mieweb/jerry-app"}
```

---

**“Show me the money.”**  
For knowledge workers, creators, and developers, the hardest part of the job often isn’t the work itself—it’s explaining the value of that work afterward.

Today, **Ozwell** announces **Jerry**, a new intelligent agent designed to articulate the real value of a day’s work—especially when that work doesn’t fit neatly into lines of code, tickets closed, or hours logged.

Inspired by the spirit of [**Jerry Maguire**](https://www.youtube.com/watch?v=yRRtnN7UVLI), Jerry exists to advocate for you.

---

### **The Problem: Invisible Work Has Real Value**

Modern work is fragmented, contextual, and cognitively demanding. A developer may spend four days untangling a deeply rooted bug and produce a [single character of code](https://www.youtube.com/watch?v=E3_95BZYIVs&t=424s). A product builder may context-switch between architecture, customer calls, research, and experimentation—only to be asked at the end of the week:

_“So… what did you actually do?”_

This constant requirement to retrospectively justify time is not just tedious—it’s fundamentally flawed. It rewards visible output over meaningful progress and penalizes deep thinking, problem-solving, and creative work.

---

### **The Solution: Jerry, Your Value Advocate**

**Jerry is an Ozwell agent who reads your activity watch data and translates it into organizational value.**

Instead of forcing workers to manually reconstruct their day, Jerry analyzes signals across tools, contexts, and time to understand:

- What were you working on
- Why it mattered
- What obstacles did you navigate
- How your effort moved the organization forward

Jerry doesn’t just summarize activity—it **interprets contribution**.

---

### **Built for Flex Workers and Creators**

Jerry is designed for people who:

- Context-switch between deep work, collaboration, and personal life
- Create value that isn’t immediately measurable
- Are tired of writing status updates that undersell their impact
- Want fairer, more accurate representations of their work

While Jerry functions as a **developer agent** and **job agent**, its audience is broader: anyone whose output is judged by simplistic metrics but whose value lies in thinking, problem-solving, and execution.

---

### **How It Works (At a High Level)**

Internally, Jerry operates as a specialized Ozwell agent:

1. An activity watch captures behavioral and contextual signals
2. A structured internal function call feeds this data into **Jerry**
3. Jerry analyzes the data with a single objective:  
   **articulate the value you bring to the organization**
4. The output is a clear, human-readable narrative suitable for managers, reviews, and leadership visibility

The result is a defensible, intelligible explanation of work that aligns effort with impact.

---

### **Why It Matters**

Measurement systems shape behavior. When organizations only measure what’s easy to see, they lose sight of what actually drives progress.

Jerry helps rebalance that equation—giving workers an advocate, managers better insight, and organizations a more honest understanding of how value is created.

Or, as Jerry himself might put it:

**“Show me the money—by showing the work that earns it.”**

---

# Plan

## **1\) Ground truth: what each system is already good at**

### **TimeHarbor \= “declared intent \+ reflection”**

![][image1]  
TimeHarbor is already positioned as “privacy-first time tracking and reflection,” with _clock-in/out, project/objective allocation, reflections/notes, user-controlled sharing, and reporting_ baked into the product framing. ([GitHub](https://github.com/mieweb/timeharbor)) So TimeHarbor should be Jerry’s **source of intent** (what I meant to do) and **self-reported outcomes/obstacles** (what happened, why it mattered).

### **ActivityWatch \= “observed behavior \+ context”**

![][image2]  
ActivityWatch provides local watchers like `aw-watcher-window` (active window/app/title/url) and `aw-watcher-afk` (active vs AFK) ([ActivityWatch Documentation](https://docs.activitywatch.net/en/latest/watchers.html?utm_source=chatgpt.com)), exposed via a REST API organized around **buckets and events** (get/create buckets, events, heartbeats, etc.). ([ActivityWatch Documentation](https://docs.activitywatch.net/en/latest/api/rest.html?utm_source=chatgpt.com)) So ActivityWatch becomes Jerry’s **context sensor**: app/tool usage, switching, focus time, meeting clusters, etc. (without requiring the user to log everything).

### **Pulse \+ PulseVault \= “high-signal artifacts you can safely share”**

![][image3]![][image4]  
Pulse is explicitly built for secure short-form institutional knowledge video, with “local-first security” and “on-device until explicitly shared” language. ([GitHub](https://github.com/mieweb/pulse)) PulseVault is the secure backend and web UI for storing/transcoding, and serving content (Fastify \+ FFmpeg \+ Redis \+ Nginx, HMAC-signed access, tus uploads, etc.). ([GitHub](https://github.com/mieweb/PulseVault)) For Jerry: Pulse clips are optional but powerful **evidence** (quick “here’s what I learned/fixed/shipped” clips) and **organizational value artifacts** (trainings, demos, walkthroughs).

### **Ozwell API \= “agent runtime \+ streaming \+ tool-calling”**

![][image5]  
Ozwell’s public API spec highlights real-time streaming (SSE), tooling, and separation between frontend widget vs. custom backend patterns. ([GitHub](https://github.com/mieweb/ozwellai-api)) Jerry should be implemented as a **backend-driven agent** (Option 2/3 style): your backend assembles the day’s signals and calls Ozwell to produce the narrative output. ([Mieweb](https://mieweb.github.io/ozwellai-api))

---

## **2\) Jerry’s product contract (what it must output)**

Jerry should produce **three tiers of output** from the same underlying data:

1. **Daily narrative (manager-readable)**
    - What I worked on (themes, not raw logs)
    - Why it mattered (impact framing)
    - Obstacles navigated (invisible work made visible)
    - Progress/outcomes (even if no “big ship”)

2. **Evidence-backed appendix (defensible)**
    - “Focus blocks” inferred from ActivityWatch
    - TimeHarbor sessions mapped to those blocks
    - Links to artifacts: PRs, docs, Pulse clips, tickets (as available)

3. **Weekly / review-ready rollups**
    - Trends: deep work %, collaboration %, context switching load
    - Highlights: “most valuable breakthroughs,” “risk reduced,” “speed gained.”

---

## **3\) High-level architecture**

### **A. Local collection (user-controlled)**

- **ActivityWatch** runs locally and collects events into buckets (window/afk/etc). ([ActivityWatch Documentation](https://docs.activitywatch.net/en/latest/api/rest.html?utm_source=chatgpt.com))
- **TimeHarbor** logs deliberate sessions \+ user reflections. ([GitHub](https://github.com/mieweb/timeharbor))
- **Pulse** optionally records short clips (demo, recap, walkthrough) that are _local-first until shared_. ([GitHub](https://github.com/mieweb/pulse))

### **B. Jerry Ingestion Service (your backend)**

A small service (could be a Node/Fastify app since Ozwell ecosystem is already Node-friendly) that:

- Pulls ActivityWatch events for a time window (ex, “today 00:00–23:59”)
- Pulls TimeHarbor sessions/notes for the same window
- Pulls shared PulseVault artifacts (or links) when present ([GitHub](https://github.com/mieweb/PulseVault))
- Normalizes everything into a **Jerry Daily Context Document (JSON)**

### **C. Ozwell “Jerry” Agent (interpretation layer)**

- Receives the Daily Context Document as structured input  

- Uses a consistent rubric to produce:
    - value narrative
    - evidence appendix
    - suggested manager-facing bullets

- Streams output via SSE to UI (optional) ([GitHub](https://github.com/mieweb/ozwellai-api))

---

## **4\) Data model: the “Jerry Daily Context Document.”**

Design this as an explicit schema so you can:

- re-run narratives,
- Compare output quality,
- and ensure privacy controls are enforced.

Recommended top-level shape:

- `identity`: userId, workspaceId, timezone
- `Privacy Policy`: What categories are allowed to leave the device
- `timeharbor`:
    - sessions: start/end, project/objective tags, reflections, user-declared “outcome.”
- `activitywatch`:
    - focusBlocks: merged window events excluding AFK, grouped by app/project heuristic
    - contextSwitching: switches/hour, meeting clusters, “interrupt density.”
- `artifacts`:
    - pulse: shared clips (id, title, tags, link, visibility)
    - links: PRs, issues, docs (optional integrations later)
- `orgContext`:
    - current goals / OKRs / project priorities (manual or pulled from your systems)

This is the core “function call” payload your press release references.

---

## **5\) Mapping logic (how the three tools become “value”)**

### **Step 1 — Build a timeline spine**

- Start with ActivityWatch: build a day timeline from bucket events (window \+ afk). ([ActivityWatch Documentation](https://docs.activitywatch.net/en/latest/api/rest.html?utm_source=chatgpt.com))
- Segment into **focus blocks** (continuous work in the same app/domain) and **collaboration blocks** (Zoom/Meet/Slack heavy segments).

### **Step 2 — Attach TimeHarbor intent & reflections**

- For each TimeHarbor session, map to overlapping focus blocks.
- Use TimeHarbor as the “truth” for _what the work was supposed to be_ and the user’s own summary/notes. ([GitHub](https://github.com/mieweb/timeharbor))

### **Step 3 — Lift raw activity into “work themes”**

Create a lightweight classifier that maps window titles/apps/URLs into:

- project,
- work type (debugging, writing, planning, meeting, admin),
- “value category” (delivery, risk reduction, enablement, learning, support).

### **Step 4 — Add Pulse as evidence (optional but high leverage)**

- If the user recorded a 30–90s “end of block recap” clip in Pulse:
    - treat it as the best available summary of what changed and why
    - Attach it to the relevant theme. Pulse is designed for secure institutional knowledge video with local-first handling, which aligns well with “share only what you choose.” ([GitHub](https://github.com/mieweb/pulse))

---

## **6\) Agent design: “Jerry” prompt/rubric (the secret sauce)**

Jerry should be constrained by a rubric so it doesn’t become a generic summarizer:  
![][image6]  
**Inputs**

- timeline \+ themes
- TimeHarbor reflections
- inferred obstacles (context switching spikes, repeated returns to the same repo/app, long “stuck” blocks)
- artifacts (Pulse clips, PR links, etc.)

**Outputs**

- “Value narrative” in org language:
    - impact framing, tradeoffs, risks retired, options explored

- “Manager bullets” (copy/paste)  

- “Evidence appendix” (defensible mapping back to signals)  

- “Follow-ups,” Jerry suggests:
    - things to document, people to update, risks to flag

**Guardrails**

- Never expose raw window titles/URLs unless the user explicitly opts in
- Default to aggregating to themes (“debugged auth flow”), not surveillance (“spent 47 min in file X”)

---

## **7\) Privacy & control (must be a first-class feature)**

TimeHarbor explicitly emphasizes “private by default” and user-controlled sharing. ([GitHub](https://github.com/mieweb/timeharbor)) Pulse similarly emphasizes “on-device until explicitly shared.” ([GitHub](https://github.com/mieweb/pulse))

So implement privacy as a **policy engine** inside Jerry Ingestion:

- Local-only vs exportable fields  

- Redaction rules (URLs, window titles, filenames)  

- “Share modes”:
    1. **Private journal** (full fidelity, local)
    2. **Manager summary** (aggregated, redacted)
    3. **Evidence pack** (includes links/artifacts user-approved)

---

## **8\) MVP delivery plan (phased so you ship fast)**

### **Phase 0 — Minimal Jerry (1–2 weeks)**

- Ingestion service pulls:
    - TimeHarbor sessions \+ notes
    - ActivityWatch focus blocks \+ AFK (no fine-grained titles)

- Jerry outputs daily narrative \+ bullets \+ 3 metrics:
    - deep work time
    - collaboration time
    - context switches/hour

### **Phase 1 — “Defensible” Jerry (next)**

- Evidence appendix: each narrative claim references:
    - TimeHarbor session id(s)
    - aggregated ActivityWatch block id(s)

- Add “obstacle detection” heuristics:
    - Repeated re-entry into the same block
    - unusually high switching
    - long blocks with no artifact

### **Phase 2 — Pulse-powered “proof of work”**

- Allow linking a Pulse clip to a TimeHarbor session
- If PulseVault is used, store clips with secure access patterns (it already describes secure uploads \+ serving architecture). ([GitHub](https://github.com/mieweb/PulseVault))
- Jerry includes “watch this 45s recap” links in the appendix for stakeholders

### **Phase 3 — Org integrations (optional)**

- GitHub/Jira/Linear/Docs ingestion to auto-link artifacts
- OKR alignment (tag themes to goals)

---

## **9\) Concrete implementation sketch (what to build)**

### **Services**

1. **Jerry Ingestion API (Node/Fastify)**  


- Endpoints:
    - `POST /jerry/daily/build` (build context doc for date range)
    - `POST /jerry/daily/render` (calls Ozwell and streams output)

- Connectors:
    - ActivityWatch REST: buckets/events ([ActivityWatch Documentation](https://docs.activitywatch.net/en/latest/api/rest.html?utm_source=chatgpt.com))
    - TimeHarbor DB/API (Meteor/Mongo-based per repo description) ([GitHub](https://github.com/mieweb/timeharbor))
    - PulseVault API (later; start by storing links)

2. **Jerry UI (could be inside TimeHarbor)**

- “Generate today’s narrative.”
- Toggle: private /manager/evidencee
- Editable output (user can correct before sharing)

### **Core libraries**

- `activitywatch-client` usage or direct REST calls ([ActivityWatch Documentation](https://docs.activitywatch.net/en/latest/api/rest.html?utm_source=chatgpt.com))
- A shared `jerry-schema` package (Zod) to validate context docs (fits Ozwell’s Zod-first spec culture) ([GitHub](https://github.com/mieweb/ozwellai-api))

---

## **10\) How you’ll know it works (acceptance tests)**

- Given a day with:
    - 2 TimeHarbor sessions, 1 reflection each
    - ActivityWatch shows 3 major focus blocks \+ 1 meeting block.

- Jerry must output:
    - a narrative that mentions both projects,
    - at least one obstacle,
    - at least one “why it mattered” statement tied to an org outcome,
    - an appendix that maps claims → session/block ids,
    - with redactions applied by default.

---

# Appendix

- [TimeHarbor](https://github.com/Dharp02/TimeharborApp)
    - TimeHarbor Navya \- [https://github.com/mieweb/timeharbor](https://github.com/mieweb/timeharbor) (Production)
    - Doug: [https://github.com/mieweb/timeharbor-app](https://github.com/mieweb/timeharbor-app) \- [https://www.youtube.com/shorts/Hg5W6LPyLWg](https://www.youtube.com/shorts/Hg5W6LPyLWg)
    - Poonam [https://github.com/Dharp02/TimeharborApp](https://github.com/Dharp02/TimeharborApp)
- Pulse
    - [https://github.com/mieweb/pulse](https://github.com/mieweb/pulse) [https://apps.apple.com/us/app/pulse-cam/id6748621024](https://apps.apple.com/us/app/pulse-cam/id6748621024) [https://play.google.com/store/apps/details?id=com.mieweb.pulse](https://play.google.com/store/apps/details?id=com.mieweb.pulse)
    - [https://github.com/mieweb/PulseVault](https://github.com/mieweb/PulseVault) [https://pulse-vault.opensource.mieweb.org/](https://pulse-vault.opensource.mieweb.org/)
    - [https://github.com/mieweb/pulseclip](https://github.com/mieweb/pulseclip) [https://pulseclip.os.mieweb.org](https://pulseclip.os.mieweb.org)
- Check out:
    - [https://activitywatch.net/](https://activitywatch.net/)
    - [https://mieweb.github.io/ozwellai-api/](https://mieweb.github.io/ozwellai-api/)
    - [https://github.com/mieweb/ychart](https://github.com/mieweb/ychart)
