# Footnotes and search tools
_Exported on 7/13/2026 at 11:06:03 EDT from Cursor (3.11.13)_

---

**User**

there's footnotes as MCP and it's tools. that includes search_hybrid (and what else?) and there's search_memory tool which is Jerry's own tool. 

and I need to load different .tsx to use them
and they work separately?

is that correct? 


---

**Cursor**

I'll trace how footnote MCP tools, `search_memory`, and the `.tsx` loading paths are wired in the codebase.


You're mostly right on the **two search paths**, but not on **loading different `.tsx` files** or them **working fully separately at runtime**.

## Footnote MCP tools (external)

Footnote exposes **four** tools via MCP (`docidx mcp`), adapted in `footnote-adapter.ts`:

1. **`search_hybrid`** — vector + full-text (default for doc search)
2. **`search_fts`** — BM25 keyword search
3. **`search_literal`** — exact string / grep-like search
4. **`read_document`** — fetch full doc by path

```230:235:packages/tools/src/mcp/footnote-adapter.ts
export const FOOTNOTE_TOOL_NAMES = [
  "search_hybrid",
  "search_fts",
  "search_literal",
  "read_document",
] as const;
```

Those are **not** Jerry-native tools. Jerry spawns the footnote subprocess (`node vendor/footnote/bin/docidx.js mcp --db <path>`) and wraps the MCP calls.

## Jerry's own `search_memory` (in-process)

`search_memory` is a **Jerry runtime tool** in `packages/tools/src/runtime/search-memory.ts`. It:

- Uses `ctx.vectors` (the `VECTORS` / `CloudVectorIndex` binding)
- Calls Ollama directly for embeddings (`nomic-embed-text`)
- Does **basic semantic vector search only** (no FTS, no literal grep, no `read_document`)

## They are **not** both available for document search

At runtime, Jerry merges tools in `createJerryToolsWithMcp`. If footnote MCP loaded successfully and `search_hybrid` exists, **`search_memory` is removed**:

```95:104:packages/jerry-app/src/create-tools.ts
export function createJerryToolsWithMcp(ctx: ToolContext): JerryToolSet {
  const tools = createJerryTools(ctx, { mcpTools: mcpToolsCache });

  if (mcpToolsCache?.search_hybrid) {
    const result = { ...tools };
    delete result.search_memory;
    return result;
  }

  return tools;
}
```

So it's **either/or** for document search:

| Condition | What the agent gets |
|-----------|---------------------|
| Footnote MCP available | `search_hybrid`, `search_fts`, `search_literal`, `read_document` |
| MCP unavailable / disabled | `search_memory` only |

The other Jerry tools (`summarize_activity`, `read_file`, `index_document`, etc.) are always there regardless.

## They hit **different indexes**

From phase-2 notes:

- **`search_memory`** → Jerry's Slice 1 vector store (`VECTORS` binding, indexed via `/v1/index` or `index_document`)
- **Footnote MCP** → footnote's own `.footnote` SQLite index (configured via `FOOTNOTE_DB`, default `./.footnote`)

So even when both *could* exist in theory, they're backed by **separate storage**, not the same index.

## No `.tsx` loading — it's `.ts` / worker wiring

This repo has **no `.tsx` entry points** for tools. Wiring is:

- `packages/jerry-app/worker/index.mjs` — worker entry
- `packages/jerry-app/src/create-tools.ts` — MCP load + tool merge
- `packages/jerry-app/src/agent.ts` — agent instructions (documents both tool sets)

On each agent request, the worker calls `ensureMcpTools()` then `createJerryToolsWithMcp`:

```24:38:packages/jerry-app/worker/index.mjs
async function prepareMcpForRequest(request, url) {
  // ...
  try {
    const body = await request.clone().json();
    await ensureMcpTools(body.profile);
  } catch {
    await ensureMcpTools();
  }
}
```

You don't pick tools by loading a different UI `.tsx`. The **jerry-client** renderer (`chat-shell.tsx`, etc.) is just the chat UI — it talks to the worker API and doesn't choose which search tools load.

## Environment matters

Footnote MCP needs **stdio + child process spawn** (`isMcpAvailable()`). That works on **local CLI** runs, not on Cloudflare Workers (no process spawning). In Workers, you get `search_memory` fallback only.

Disable footnote MCP with:
- `JERRY_FOOTNOTE_ENABLED=false` or
- `JERRY_MCP_DISABLED=true`

---

**Short answer:** Yes — footnote MCP gives you `search_hybrid` plus three other search/read tools; `search_memory` is Jerry's simpler in-process fallback. They are **mutually exclusive** for search (not used side by side), backed by **different indexes**, and selected automatically by MCP availability — not by loading different `.tsx` files.

---

**User**

compare search_memory and search_hybrid 
should we make footnote default if it's doing the same job as the fallback tool (search_memory) but better? 

---

**Cursor**

I'll compare both implementations and how defaults are chosen in the codebase and phase-2 plan.


## `search_memory` vs `search_hybrid`

| | **`search_memory`** | **`search_hybrid`** (footnote MCP) |
|---|---|---|
| **What it is** | Jerry in-process tool | Footnote MCP tool, wrapped by Jerry |
| **Search type** | Vector / semantic only | Vector **+** FTS5 keyword (hybrid) |
| **Companion tools** | None (use `read_file` separately) | `search_fts`, `search_literal`, `read_document` |
| **Index** | Jerry `VECTORS` binding | Footnote `.footnote` SQLite DB |
| **Ingest path** | `index_document`, `POST /v1/index`, collector | Footnote `docidx` indexer (separate) |
| **Embeddings** | Direct Ollama `nomic-embed-text` calls | Footnote's own embedder inside `docidx` |
| **Runtime** | Works in Workers + local (if `VECTORS` exists) | Local only — needs child process spawn |
| **Overhead** | One in-process call | Spawn `docidx mcp` + stdio MCP round-trip |
| **When agent sees it** | MCP unavailable or disabled | MCP loads successfully |

**Capability:** `search_hybrid` is strictly richer for document search — same semantic angle, plus keyword matching and related tools.

**Same job?** At a high level, yes: "find relevant docs." In practice they're not interchangeable today because they search **different indexes** fed by **different ingest pipelines**.

---

## Is footnote already the default?

**Locally, mostly yes** — when MCP can spawn:

1. `resolveMcpServers()` includes footnote unless `JERRY_FOOTNOTE_ENABLED=false` or `JERRY_MCP_DISABLED=true`
2. `ensureMcpTools()` connects before agent turns
3. If `search_hybrid` loads, `search_memory` is removed

So the design already says: **prefer footnote when you can; fall back to `search_memory` when you can't.**

What's not done yet (per phase-2 Slice 2): end-to-end wiring is still marked incomplete — acceptance scenario not verified, and docs/manual still describe `search_memory` as the primary search path.

---

## Should footnote be the default?

**Yes for local/CLI — with one big caveat.**

### Why yes

- Better search (hybrid > vector-only)
- `read_document` fits a search → read flow
- `search_fts` / `search_literal` for keywords and exact phrases
- Footnote is already the intended Phase 2 upgrade path
- `search_memory` was always a thin Slice 1 bridge

### The caveat: two indexes today

```
Collector / index_document / POST /v1/index  →  Jerry VECTORS  →  search_memory
Footnote docidx indexer                       →  .footnote DB   →  search_hybrid
```

Making footnote the default **doesn't help** if your docs only land in Jerry's `VECTORS` store. The agent would call `search_hybrid` and find nothing while `search_memory` would have worked.

That's the main reason `search_memory` still exists — not because hybrid is worse, but because:

1. **Fallback** when MCP subprocess fails or isn't available
2. **Workers** can't spawn MCP children
3. **Index split** — ingest hasn't been unified onto one store

---

## Recommended direction

**Short term (what you have now):**

| Environment | Default search | Fallback |
|---|---|---|
| Local CLI (`jerry`, `mieweb --target local`) | `search_hybrid` via footnote MCP | `search_memory` if MCP fails |
| Cloudflare Workers | `search_memory` only | N/A (no MCP spawn) |

Keep `search_memory` as fallback; don't delete it yet.

**Medium term (to truly make footnote default):**

Pick **one index**, not two parallel ones:

1. **Option A — unify ingest onto `.footnote`**  
   Point collector/`/v1/index` at footnote's indexer so everything `search_hybrid` can see is actually there.

2. **Option B — in-process footnote instead of MCP** (chat13's `LocalVectorizeIndex` idea)  
   Wire `VECTORS` to footnote's `createLocalIndex({ dbDir: './.footnote' })` so `search_memory` uses the same SQLite hybrid store without MCP overhead. Then either rename it or still prefer MCP tools for FTS/literal/read.

3. **Option C — MCP consume + single `FOOTNOTE_DB`**  
   Keep MCP for rich tools, but ensure Jerry ingest writes into that same `FOOTNOTE_DB` path.

Until ingest is unified, "footnote as default" is only half true — better tool, possibly empty index.

---

## Practical answer

| Question | Answer |
|---|---|
| Is `search_hybrid` better than `search_memory`? | **Yes**, for local document search |
| Should footnote be default when available? | **Already is** in code; finish wiring + verify acceptance |
| Should we remove `search_memory`? | **Not yet** — Workers fallback + MCP failure + index split |
| What blocks full default? | **Unifying ingest** so one index backs whichever search tool runs |

**Bottom line:** Treat footnote as the primary search path on local. Keep `search_memory` as a degraded-mode fallback until ingest converges on one store (ideally `.footnote`) and you have a Workers story (in-process footnote vectorize, or accept vector-only in cloud).

If you want, I can sketch a concrete "unify ingest" plan mapped to your collector + `/v1/index` + `docidx` paths (still Ask mode — guidance only).

