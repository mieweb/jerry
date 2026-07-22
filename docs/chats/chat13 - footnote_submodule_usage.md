# Footnote submodule usage
_Exported on 7/6/2026 at 11:03:56 EDT from Cursor (3.10.11)_

---

**User**

@vendor/footnote 
how is this submodule used here and where it should be a part of phase 2 slice 1 we just implemented and use it instead of nomic-embed-text ollama? 

---

**Cursor**

I'll help you understand the `vendor/footnote` submodule and how it relates to Phase 2 Slice 1. Let me examine the submodule and the recent implementation.

Based on my analysis, here's a comprehensive explanation of the `vendor/footnote` submodule and its role in Phase 2 Slice 1:

## What is `vendor/footnote`?

The `vendor/footnote` submodule (from `github.com/mieweb/melvil-artipod-footnote`) is a **portable SQLite-based vector database** that provides:

1. **`@mieweb/footnote/vectorize`** - A Cloudflare Vectorize-compatible local vector index using `sqlite-vec`
2. **Ollama embeddings integration** - Built-in support for `nomic-embed-text` and other Ollama models
3. **FTS5 full-text search** - BM25 ranking for keyword search
4. **Hybrid search** - Combines vector similarity + keyword search
5. **MCP server** - Exposes search tools via Model Context Protocol

## Current Implementation vs. Footnote Usage

### What Phase 2 Slice 1 Currently Uses ❌

In the files you just implemented:

```5:47:/Users/shubhdeepsarkar/Developer/my_project/MIE Team Jerry/jerry-master/jerry/packages/tools/src/runtime/embeddings.ts
export interface EmbeddingConfig {
  ollamaUrl?: string;
  model?: string;
}

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "nomic-embed-text";

/**
 * Generate an embedding for a text string using Ollama.
 *
 * @param text - The text to embed
 * @param config - Optional configuration for Ollama URL and model
 * @returns The embedding vector (768 dimensions for nomic-embed-text) or null on failure
 */
export async function getEmbedding(
  text: string,
  config: EmbeddingConfig = {}
): Promise<number[] | null> {
  const ollamaUrl = config.ollamaUrl ?? DEFAULT_OLLAMA_URL;
  const model = config.model ?? DEFAULT_MODEL;

  try {
    const res = await fetch(`${ollamaUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text }),
    });

    if (!res.ok) {
      console.error(`Ollama embedding request failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = (await res.json()) as { embedding?: number[] };
    return data.embedding ?? null;
  } catch (err) {
    console.error(`Ollama embedding error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
```

**Problem:** You're making direct Ollama API calls and manually managing embeddings. This duplicates functionality that footnote already provides.

### What You Should Use Instead ✅

Replace the custom `embeddings.ts` implementation with **footnote's `LocalVectorizeIndex`**:

```typescript
import { createLocalIndex } from '@mieweb/footnote/vectorize';

// Create a local vector index backed by footnote
const vectorIndex = createLocalIndex({
  name: 'jerry-memory',
  dimensions: 768,
  metric: 'cosine',
  dbDir: './.footnote',
  embedder: {
    model: 'ollama:nomic-embed-text',
    dimension: 768
  }
});

// Now you have a CloudVectorIndex-compatible interface
await vectorIndex.upsert([
  { id: 'doc_1', text: 'Document content', metadata: { title: 'My Doc' } }
]);

const results = await vectorIndex.query('search query', {
  topK: 5,
  returnMetadata: 'all'
});
```

## Benefits of Using Footnote's LocalVectorizeIndex

1. **Implements `CloudVectorIndex` contract** - Drop-in replacement for Cloudflare Vectorize
2. **Auto-embedding support** - Pass `{ text }` instead of manually calling embeddings
3. **Built-in caching** - Embeddings are cached by content hash (`.embed-nomic-embed-text/`)
4. **Persistent storage** - SQLite-backed, survives restarts
5. **Production-ready** - Same code works locally (sqlite-vec) and on Cloudflare (real Vectorize)
6. **Metadata filtering** - Advanced queries with `$eq`, `$in`, `$gt`, etc.
7. **Better error handling** - Retries on context length errors, model not found detection

## Integration Plan for Phase 2 Slice 1

### Current State
- ✅ You implemented `embeddings.ts` with direct Ollama calls
- ✅ You implemented `index-document.ts` and `search-memory.ts` using the CloudVectorIndex binding
- ✅ The `wrangler.jsonc` declares `VECTORS` binding

### What Should Change

**Option 1: Use footnote directly (Recommended)**

Replace your `embeddings.ts` implementation:

```typescript
// packages/tools/src/runtime/footnote-vector-index.ts (NEW)
import { createLocalIndex } from '@mieweb/footnote/vectorize';
import type { CloudVectorIndex } from '@mieweb/cloud-types';

export function createFootnoteVectorIndex(): CloudVectorIndex {
  return createLocalIndex({
    name: 'jerry-memory',
    dimensions: 768,
    metric: 'cosine',
    dbDir: './.footnote',
    embedder: {
      model: 'ollama:nomic-embed-text',
      dimension: 768
    }
  }) as unknown as CloudVectorIndex;
}
```

Then in `index-document.ts` and `search-memory.ts`, you can simplify:

```typescript
// Instead of manually calling getEmbedding:
const embedding = await getEmbedding(content);
await ctx.vectors.upsert([{ id, values: embedding, metadata }]);

// Use footnote's auto-embed:
await ctx.vectors.upsert([{ 
  id, 
  text: content,  // <-- footnote handles embedding internally
  metadata 
}]);
```

**Option 2: Keep current approach, add footnote later**

If you want to keep what you built, that's fine! The footnote integration becomes **Phase 2 Slice 2** (MCP Consume), where you'll:

1. Run footnote as an MCP server: `docidx mcp --db ./.footnote`
2. Consume its richer tools: `search_hybrid`, `search_fts`, `search_literal`, `read_document`
3. Get FTS + literal search without reimplementing them

## Recommendation

**Use footnote's `LocalVectorizeIndex` now** in Slice 1 because:

1. It's already a git submodule - you have the code
2. It implements the exact `CloudVectorIndex` contract your tools expect
3. You get embedding caching, better error handling, and persistence for free
4. Your code becomes **truly portable** - same handler works locally and on Cloudflare
5. Slice 2 (MCP Consume) can then add the *additional* search modes (FTS, literal, grep) via MCP tools

The `nomic-embed-text` Ollama model is still used - footnote just wraps it better than your current direct implementation.

Would you like me to refactor the Slice 1 implementation to use footnote's `LocalVectorizeIndex` directly?

---

**User**

Any updates needed in @vendor/footnote/ to use it here insetead of nomic-embed from olama? 

---

**Cursor**

Let me check the current state of the `vendor/footnote` submodule and what would be needed to integrate it.

Based on my analysis of your codebase and the `vendor/footnote` submodule, here's what you need to know:

## Current Status

**Good news:** `vendor/footnote` is **already integrated into your pnpm workspace**:

```6:6:pnpm-workspace.yaml
  - "vendor/footnote"
```

However, it's **not yet a dependency** in your `packages/tools/package.json`, and footnote **isn't built** (no `dist/` folder).

## What Updates Are Needed

### 1. **Add footnote as a dependency** (in `packages/tools/package.json`):

```json
{
  "dependencies": {
    "ai": "^4.0.0",
    "zod": "^3.23.0",
    "@mieweb/cloud-types": "workspace:*",
    "@mieweb/footnote": "workspace:*"  // ← ADD THIS
  }
}
```

### 2. **Install dependencies and build footnote**:

Since Jerry uses `tsx` for TypeScript execution (just like vendor/cloud packages), you have **two options**:

**Option A: Use from source** (like cloud packages do)
- No build needed
- Import directly: `import { createLocalIndex } from '@mieweb/footnote/vectorize'`
- TypeScript resolves to `vendor/footnote/src/vectorize/index.ts`
- Works with `tsx` at runtime

**Option B: Build footnote first**
```bash
cd vendor/footnote
npm run build  # Creates dist/ folder
```

**Recommendation:** Use **Option A** (from source) since that's how the vendor/cloud packages work in your monorepo.

### 3. **No changes needed in vendor/footnote itself**

The submodule is at commit `6ab7867` (current main) and has all the features you need:
- ✅ `LocalVectorizeIndex` with `CloudVectorIndex`-compatible interface
- ✅ Ollama embedder with `nomic-embed-text` support
- ✅ Auto-embed extension (`{ text }` instead of `{ values }`)
- ✅ Caching, error handling, retry logic

### 4. **Dependency considerations**

Footnote has native dependencies that are already in your workspace:

```yaml
onlyBuiltDependencies:
  - better-sqlite3  # ← Already specified in pnpm-workspace.yaml
```

But you may need to ensure these are installed:
- `better-sqlite3` (for sqlite-vec)
- `sqlite-vec` (vector extension)
- `openai` (for embedding types, even if using Ollama)

These will be automatically installed when you add `@mieweb/footnote: workspace:*` and run `pnpm install`.

## Integration Summary

**To use footnote instead of your custom `embeddings.ts`:**

1. Add `"@mieweb/footnote": "workspace:*"` to `packages/tools/package.json`
2. Run `pnpm install` to link the workspace package
3. Import and use:

```typescript
// packages/tools/src/runtime/footnote-vector-index.ts
import { createLocalIndex } from '@mieweb/footnote/vectorize';
import type { CloudVectorIndex } from '@mieweb/cloud-types';

export function createFootnoteVectorIndex(): CloudVectorIndex {
  return createLocalIndex({
    name: 'jerry-memory',
    dimensions: 768,
    metric: 'cosine',
    dbDir: './.footnote',
    embedder: {
      model: 'ollama:nomic-embed-text',
      dimension: 768
    }
  }) as unknown as CloudVectorIndex;
}
```

4. Replace your manual `getEmbedding()` calls with footnote's auto-embed feature

No updates to the vendor/footnote submodule code itself are needed - it's ready to use as-is!

