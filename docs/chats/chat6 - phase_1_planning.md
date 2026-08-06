# Phase 1 planning
_Exported on 6/30/2026 at 17:53:15 EDT from Cursor (3.9.16)_

---

**User**

Plan for phase 1 @plan.md:491-508  

---

**Cursor**

Researching the Phase 1 scope and current codebase to draft an actionable plan.


Gathering architecture details from plan.md and key implementation files.


Creating the Phase 1 plan from the architecture doc and current codebase state.


---

**User**

save this in @docs/plans/ as phase-1 too 

---

**Cursor**

Saving the Phase 1 plan to `docs/plans/phase-1.md`, matching the Phase 0 tracker format.


Creating `docs/plans/phase-1.md` in the Phase 0 tracker format, with slice checklists and the full plan content.


Fixing a typo in the saved file.


Saved the Phase 1 plan to [docs/plans/phase-1.md](docs/plans/phase-1.md).

It follows the same structure as [docs/plans/phase-0.md](docs/plans/phase-0.md):

- **Slice checklists** — nine slices with unchecked progress items and PR placeholders
- **Full plan content** — architecture diagrams, build order, items 1–7, out-of-scope, risks
- **Done when** — acceptance criteria from plan.md §14

All slice items start unchecked so you can tick them off as work lands.

---

**User**

Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself.

To-do's from the plan have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the to-dos.

---

**Cursor**

I'll implement Phase 1 systematically, starting with the first to-do. Let me begin by exploring the vendor/cloud structure to understand the conventions.

Let me check the current git state of vendor/cloud and create the cloud-agent package.

Now let me create the cloud-agent package structure.

Phase 1 implementation is now complete. Here's a summary of what was built:

## Phase 1 — Event Host + Jerry MVP

### Completed Items

**1. `@mieweb/cloud-agent`** (`vendor/cloud/packages/cloud-agent`)
- `hostAgent()` API that binds an agent definition + runtime to a Durable Object
- Session DO with queue-driven turns, suspend/resume persistence, and alarms
- Storage module for sessions, events, messages, activity_events, summaries

**2. `@mieweb/cloud-agent-cli`** (`vendor/cloud/packages/cloud-agent-cli`)
- Message-first CLI dispatcher with `--call` (streaming) and `-txt`/`--put` (fire-and-forget) modes
- Agent name from `basename(argv[0])` for multicall pattern

**3. Jerry Bindings**
- Updated `wrangler.jsonc` with SESSION (DO), JOBS (queue), VECTORS bindings
- Updated `mieweb.jsonc` with local adapter drivers
- Created D1 migration `0001_events.sql` with full event model schema

**4. Jerry Worker** (`packages/jerry-app`)
- Refactored to export `fetch`, `queue`, `scheduled` handlers
- AgentSession DO class wired via `hostAgent()`
- Jerry agent definition with value-advocate persona

**5. Runtime Tools** (`packages/tools/src/runtime`)
- `summarize_activity` — queries activity_events, runs AW pure functions, persists summaries
- `search_memory` — semantic search via CloudVectorIndex
- `schedule_followup` — schedules DO alarms for future wake-ups
- `createJerryTools(ctx)` factory for tool injection

**6. Collector** (`packages/collector`)
- AW poller that fetches from `localhost:5600` and pushes to Jerry `/v1/events`
- Folder watcher using chokidar for screenshots/notes
- CLI entry point with configurable JERRY_URL, watch paths, poll interval

**7. CLI** (`packages/cli`)
- `bin/jerry.js` wrapping `@mieweb/cloud-agent-cli`
- Profile/target resolution from env vars and config files
- Sends `cwd` context with requests

**8. Portability**
- Integration test harness in `test/integration/jerry.test.ts`
- `scripts/test-portability.sh` for cross-target verification

### Known Limitations
- TypeScript errors in `vendor/cloud/packages/cloud-types` are expected (ambient Cloudflare types)
- Full acceptance scenarios require running model + AW (test stubs in place)
- File tools (`read_file`, `list_watched`) deferred to Phase 2

---

**User**

We forgot to move to a phase-1 branch first from developement branch 

move all the current updates of phase 1 to it's own branch 


---

**Cursor**

I'll create a Phase 1 branch and move all the changes to it.

Now let me commit all the Jerry repo changes.

Done. All Phase 1 changes have been moved to the `phase-1/event-host-mvp` branch.

**Branch structure:**
- `development` — clean, at the Phase 0 state
- `phase-1/event-host-mvp` — contains all Phase 1 implementation (current branch)
- `vendor/cloud` submodule — on `feature/cloud-agent` branch with cloud-agent packages

**Commits:**
- `7ce6c8b` — Phase 1 implementation (62 files, 6,737+ lines)
- `c154c39` — cloud-agent packages in vendor/cloud submodule (16 files)

You're currently on `phase-1/event-host-mvp`. If you need to push this branch to remote:

```bash
git push -u origin phase-1/event-host-mvp
```

