# CLI — Interactive Session Mode for `packages/cli`

This plan adds a lightweight **interactive conversation mode** to the Jerry CLI
(`@mieweb/jerry-cli`, `packages/cli/`) — the message-first developer CLI that
talks to the running `jerry-app` worker over HTTP. It is **not** `jerry-term`
(the standalone in-process TUI) and it is **not** an OpenCode-style full-screen
UI. The CLI stays a thin HTTP client: no `ink`/React, no command framework, no
new runtime dependencies.

> Scope decisions (locked):
> - **No live tool streaming.** While Jerry works, the CLI shows a simple
>   `…working…` indicator, then prints the final result. No SSE.
> - **Tools used are reported after the answer.** The final response lists every
>   tool Jerry called during that turn (including multiple tools in one turn).
> - **REPL lives in `packages/cli`** (Jerry-owned), reusing the client already
>   exported by `@mieweb/cloud-agent-cli`.
> - **Minimal worker change only** — enrich the existing JSON reply with a
>   `toolsUsed` field. No SSE, no live event stream.

---

## 1. Goal

Turn the one-shot CLI (`jerry <words>` → send once → exit) into a **persistent
conversation** the user can start with a greeting, hold a multi-turn session in,
and resume later — while keeping the existing one-shot path intact for scripting.

Concretely, the CLI must:

1. Start a conversation via a normalized greeting: `hello jerry` / `hi jerry` /
   `hi` / `hey` (and bare `jerry` with no args).
2. On start, show **runtime**, **model**, **session ID**, and a welcome message.
3. Persist the session for the life of the REPL; exit on `q`, `exit`, `quit`, or
   `Ctrl+C`. On exit, print how to resume: `jerry --session <session_id>`.
4. Call tools automatically (already server-side) and show a lightweight status
   (`…working…`) while a turn runs, then print the answer.
5. After the answer, show **which tools were used** for that turn. Jerry can call
   multiple tools in one turn — list all of them (e.g.
   `tools: summarize_activity · search_memory · read_file`).

Companion (non-CLI) principle carried through: **Jerry must not assert work that
no source substantiates.** This is reinforced in the agent persona and surfaced
in the CLI as a per-answer tools/sources footer (§7).

---

## 2. What already exists (so we don't rebuild it)

- **Sessions are already persistent server-side.** The `jerry-app` worker keeps
  a Durable Object + SQL tables per session (`sessions`, `messages`, `events`),
  supports suspend/resume (`waiting_for_user`), auto-generates IDs
  (`session-{ts}-{rand}`), and honors `JERRY_SESSION` / `-s|--session`.
  Persistence is therefore a **client-loop** problem, not a storage problem.
- **The HTTP client is already built.** `@mieweb/cloud-agent-cli` exports
  `streamCall`, `fireAndForget`, `getStatus`. `streamCall` already handles both
  SSE and plain-JSON responses, yielding normalized events
  (`start` / `text` / `finish` / `suspended` / `error`). Since the worker
  currently returns a single JSON blob, a call yields one `text` event with the
  full reply then `finish` — exactly the "spinner then result" shape we want.
- **Runtime/model/egress are already resolved** in `packages/cli/src/profile.ts`
  and sent in each request. The CLI already *knows* the runtime and model — it
  just never displays them. We only need to surface them.
- **Tool names are known at turn time, but not returned today.** The worker's
  `handleTurn` already sees `tool-call` events from the runtime and discards
  them while buffering the reply. A small change accumulates those names into
  `toolsUsed: string[]` on the existing JSON response — no streaming required.

Net: the interactive mode is a **client-side REPL loop** around the existing
`streamCall`, plus a banner from `loadConfig()`, plus a post-answer `tools:`
line fed by a one-field worker enrichment.

---

## 3. Current entry flow

```
bin/jerry.js → src/run.ts
  ├─ argv[0] === "mcp"   → src/mcp-server.ts (unchanged)
  └─ else                → loadConfig() + cloud-agent-cli run()  (one-shot only)
```

`cloud-agent-cli`'s parser: no args → help; `-flag` → flag mode; otherwise
`message = args.join(" ")` → one-shot `--call`. There is no REPL today.

---

## 4. Proposed entry flow

```
bin/jerry.js → src/run.ts
  ├─ argv[0] === "mcp"                    → mcp-server.ts        (unchanged)
  ├─ meta flags (--help/--version/...)    → delegate to cloud-agent-cli (unchanged)
  ├─ no args                              → startRepl(new session)
  ├─ greeting (hi/hello/hey [jerry])      → startRepl(new session)
  ├─ --session <id>  (no message)         → startRepl(resume <id>)
  └─ real message (jerry <task…>)         → delegate one-shot --call (unchanged)
```

Routing rules:

- **Greeting detection** (`src/greeting.ts`): normalize `argv.slice(2).join(" ")`
  and match `^(hi|hey|hello|yo)\b[\s,!.]*(jerry)?$/i`. A greeting is *only* a
  greeting when the whole message is a greeting — `hi jerry summarize my day`
  still runs as a normal task (not swallowed into the REPL).
- **`--session <id>` with no trailing words** → resume that session in the REPL.
  `--session <id> <words…>` keeps the existing one-shot behavior.
- Everything else routes exactly as today (backward compatible).

---

## 5. The REPL (`src/repl.ts`, new)

Built on Node's built-in `readline` (zero deps). Raw ANSI for dim/color,
respecting `NO_COLOR`.

### 5.1 Welcome banner

Rendered once on start from the resolved profile + session ID:

```
  Jerry · your value advocate

  runtime  local          model  ollama:llama3.1:8b          egress  deny
  session  session-1754239-a9f2       resume: jerry --session session-1754239-a9f2

  Hi — I report on what your activity signals actually show, and I say so when a
  source has no evidence. Ask me about your work.
  End anytime with  q · exit · Ctrl+C
```

- `runtime` / `model` / `egress`: from `loadConfig().profile` (fallback to the
  documented defaults `local` / `ollama:llama3.1:8b` / `deny` when unset).
- `session`: the resumed ID, or a freshly generated one (same format the server
  uses so resume is symmetric).

### 5.2 Loop

```
loop:
  read a line at prompt "jerry › "
  if line ∈ {q, quit, exit} or EOF → break
  if line starts with "/"          → handle slash-command (§6), continue
  if line is empty                 → continue
  print "  …working…" (transient, cleared on first output)
  toolsUsed = []
  for await event of streamCall(url, sessionId, line, { profile, context }):
    text      → clear spinner, print reply text
    tools     → accumulate tool names for this turn (from response payload)
    suspended → print the question, note the session is parked, keep looping
    error     → print error, keep looping (don't crash the session)
    finish    → stop spinner
  if toolsUsed.length > 0:
    print dim "  tools: summarize_activity · search_memory · …"
```

Example turn output:

```
  jerry › summarize my last 2 hours and pull anything related from notes
  …working…
  Between 10:00 and 12:00 you spent ~1h20m in VS Code on packages/cli …
  tools: summarize_activity · search_memory
```

- **`…working…` indicator:** a minimal transient line (or a tiny spinner via
  `setInterval`) shown after the user's turn is sent and cleared as soon as the
  first `text`/`finish` arrives. No live tool names while waiting — by design.
- **Post-answer `tools:` line:** after the reply text, print every tool name
  Jerry invoked during that turn, in call order, de-duplicated. Multiple tools
  in one turn are joined with ` · `. Omit the line entirely if no tools ran
  (pure conversational reply).
- **Same `sessionId` for the whole REPL**, so multi-turn context and later
  resume both work against the existing server-side persistence.
- Errors and suspensions **never kill the loop** — the session stays alive and
  resumable.

### 5.2.1 How `toolsUsed` reaches the CLI

The worker already observes `tool-call` events inside `handleTurn` and ignores
them. Enrich the existing JSON reply (still one blob, still no SSE):

```jsonc
{
  "ok": true,
  "sessionId": "session-…",
  "status": "idle",
  "message": "Between 10:00 and 12:00 …",
  "finishReason": "stop",
  "toolsUsed": ["summarize_activity", "search_memory"]  // NEW
}
```

Accumulate in call order; keep duplicates only if the same tool was invoked more
than once (show once with an optional count, or list once — prefer unique names
in order of first call). The CLI client maps `toolsUsed` onto a new normalized
event (or attaches it to `finish`) and renders the footer. This is the **only**
worker/`cloud-agent` change in this plan.

### 5.3 Exit

On `q`/`exit`/`quit`/`Ctrl+C`/EOF:

```
  Session saved. Resume anytime:

    jerry --session session-1754239-a9f2
```

`Ctrl+C` is caught via a `SIGINT` handler (and readline `close`) so exit is
always graceful and always prints the resume hint. A second `Ctrl+C` while a
turn is in flight force-exits.

---

## 6. Slash-commands (small, high-value, optional-per-turn)

Handled entirely client-side inside the REPL; cheap and non-bloaty:

| Command | Effect |
| --- | --- |
| `/help` | List commands + exit keys |
| `/session` | Print current session ID + resume string |
| `/new` | Start a fresh session ID (keeps the REPL open) |
| `/runtime`, `/model` | Show current values (and, later, switch by re-resolving the profile) |
| `/sources` | Show source status: ActivityWatch ✓, Local files ✓, Drive/YouTube/GitHub = WIP, TimeHuddle = planned |
| `/dryrun <task>` | Resolve the plan (model + tools that *would* run) without sending — honors `plan.md` §4's `--dry-run` promise |

`/runtime` and `/model` **switching** can land in a fast-follow; read-only
display ships first.

---

## 7. Evidence discipline (companion reinforcement)

The user's core requirement — *no assumptions when evidence is missing* — is an
agent-instruction concern, reinforced cheaply from the CLI:

- **Persona (`packages/jerry-app/src/agent.ts`):** add an explicit rule to
  `JERRY_INSTRUCTIONS`: never assert work that isn't backed by a tool result;
  when a source is unavailable or WIP (Drive/YouTube/GitHub), say
  "no evidence from `<source>`" instead of inferring.
- **CLI `tools:` footer (required):** after each answer, print the tools Jerry
  actually called this turn from `toolsUsed` (e.g.
  `tools: summarize_activity · search_memory · read_file`). This is the
  auditable "what did Jerry look at" line — not live, but accurate once the
  turn finishes.
- **Optional `sources:` gloss:** map known tool names to human SoT labels for
  readability (`summarize_activity` → ActivityWatch, `read_file` /
  `list_watched` → local files, etc.). Keep it thin; the authoritative line is
  still the tool names.

---

## 8. File-by-file changes (all in `packages/cli`)

| File | Change |
| --- | --- |
| `src/repl.ts` **(new)** | `readline` loop, banner, `…working…` indicator, post-answer `tools:` footer, slash-commands, graceful exit + resume hint. ~150–180 lines. |
| `src/greeting.ts` **(new)** | `isGreeting()` + argument normalization. Tiny + unit-tested. |
| `src/run.ts` | Add routing: no-args / greeting / `--session`-only → `startRepl()`; otherwise delegate to `cloud-agent-cli` as today. |
| `src/profile.ts` | Surface resolved `{ runtime, model, egress }` for the banner (already computed internally). Wire the currently-unused `getCwdContext()` into the REPL request context. |
| `src/index.ts` | `export { startRepl }`. |
| `src/repl.test.ts`, `src/greeting.test.ts` **(new)** | Unit tests: greeting matching, exit-keyword handling, banner assembly, `tools:` footer rendering (including multi-tool). |
| `package.json` | No new deps. Fix the `version` mismatch (`0.0.0` in `package.json` vs hardcoded `0.1.0` in `run.ts`) — single source of truth. |
| `README.md` | Document `jerry hello`, the REPL keys, slash-commands, `--session` resume, and the post-answer `tools:` line. |

**Small companion edits (not live streaming):**

| File | Change |
| --- | --- |
| `vendor/cloud/.../cloud-agent/src/session.ts` | In `handleTurn`, accumulate `tool-call` names into `toolsUsed` and include them on the JSON reply. |
| `vendor/cloud/.../cloud-agent-cli/src/client.ts` (+ types) | Pass `toolsUsed` through from the JSON response so the REPL can render it. |

Everything else in `jerry-app` / `vendor/*` stays as-is.

---

## 9. Explicitly out of scope (to avoid bloat)

- No live per-tool streaming / SSE while Jerry works (only a post-answer
  `tools:` summary after the result).
- No `ink`/React/OpenTUI full-screen UI, no `commander`/`yargs`.
- No in-process agent loop (that is `jerry-term`'s job) — the CLI remains a thin
  HTTP client to the worker.
- No new config schema — reuse the existing `.jerry.json` / env resolution.

---

## 10. Acceptance walkthrough

1. `jerry hello` → banner shows `runtime`, `model`, session ID, welcome; prompt
   appears.
2. Type `summarize my last 2 hours` → `…working…` shows, then the summary prints;
   then `tools: summarize_activity`.
3. Type a multi-source ask (`summarize my last 2 hours and check my notes`) →
   answer prints, then `tools: summarize_activity · search_memory` (or
   `read_file` / etc. — every tool Jerry actually called, in order).
4. Type a follow-up (`what did I spend the most time on?`) → answered in the same
   session with context (server-side history); tools footer reflects that turn
   only.
5. Pure chat with no tools → answer prints with **no** `tools:` line.
6. `Ctrl+C` → prints `jerry --session <id>` resume hint and exits cleanly.
7. `jerry --session <id>` later → banner shows the **same** session ID; the
   follow-up thread continues from server-persisted history.
8. `jerry summarize my last 2 hours` (no greeting) → unchanged one-shot behavior,
   proving backward compatibility.

---

## 11. Sequencing

1. `greeting.ts` + tests (pure, trivial).
2. Worker: accumulate `toolsUsed` in `handleTurn` and return it on the JSON
   reply; pass through in `cloud-agent-cli` client/types.
3. `run.ts` routing (no-args / greeting / `--session`-only → REPL).
4. `repl.ts`: banner + loop + `…working…` + post-answer `tools:` footer +
   graceful exit + resume hint.
5. Slash-commands (`/help`, `/session`, `/new`, `/sources`; read-only
   `/runtime` `/model`).
6. `profile.ts`: surface runtime/model/egress; wire `getCwdContext()`.
7. Persona evidence rule (`jerry-app/src/agent.ts`) + optional SoT gloss on the
   `tools:` line.
8. README + version fix.

Steps 1–4 deliver the full requested experience (including multi-tool
reporting); 5–8 are polish that can land incrementally.
