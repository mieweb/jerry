# @mieweb/jerry-collector

Local sidecar that watches folders and screenshots, polls ActivityWatch, and pushes events into Jerry via fetch/queue.

This package is host-specific (requires local filesystem and localhost access) and runs on the user's machine, not in the portable worker.

## Quick start

```bash
FOOTNOTE_DB=~/jerry-index/docs pnpm --filter @mieweb/jerry-collector dev -- --watch ~/Notes
```

Keep the command on one line — a shell line continuation that mangles a flag into `' --watch'` now exits with an error instead of starting without a watcher.

## What it does

- Watches the given folders with `chokidar`, including files that already exist at startup
- POSTs an activity event per file to `/v1/events`, which backs the `list_watched` tool
- Uploads text content to `/v1/files`, which backs the `read_file` tool
- Keeps a [footnote](https://github.com/mieweb/melvil-artipod-footnote) `docidx` index in sync with one root, which backs `search_hybrid`, `search_fts`, `search_literal`, and `read_document`
- Polls ActivityWatch on `localhost:5600` and forwards its buckets

Builds are incremental and debounced, and never overlap. After each build the collector asks the worker to respawn its footnote MCP child via `/v1/mcp/reload`.

## Constraints

- A footnote index tracks exactly one root. With several `--watch` paths, name the indexed one with `--footnote-root`, or indexing is skipped rather than pruning the others.
- Indexing needs an embedder even when Jerry's chat model is a cloud provider: Ollama with `nomic-embed-text` by default, or `--embedding-model text-embedding-3-small` with `OPENAI_API_KEY`, or `--embedding-model mock` for keyword-only search.

Run `jerry-collector --help` for the full flag list.

## Documentation

- Full walkthrough: [docs/manual.md §20 — Adding a Folder to Collector Ingestion](../../docs/manual.md#20-adding-a-folder-to-collector-ingestion)
- Daily startup: [docs/manual.md §3](../../docs/manual.md#3-daily-development--starting-the-stack)
- Architecture: [plan.md §11](../../plan.md)
