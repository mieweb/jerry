# Phase 0 — Foundations

This document tracks Phase 0 implementation progress. See [plan.md §13](../../plan.md) for the canonical architecture definition.

## Slices

### workspace-scaffold

Set up the monorepo skeleton: pnpm workspaces, strict TypeScript, ESLint, Node test runner, script-first CI, four package stubs.

- [x] Root tooling: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `tsconfig.json`, `eslint.config.js`
- [x] Package skeletons: `jerry-app`, `tools`, `collector`, `cli` with placeholder exports and tests
- [x] CI: `scripts/ci.sh` + `.github/workflows/ci.yml`
- [x] Documentation: this file, README Development section

**PR:** https://github.com/mieweb/jerry/pull/2 (merged into `development`)

### submodules

Add platform dependencies as git submodules under `vendor/`.

- [x] `vendor/cloud` → `mieweb/cloud`
- [x] `vendor/footnote` → `mieweb/melvil-artipod-footnote`
- [x] `vendor/ozwellai-api` → `mieweb/ozwellai-api`
- [x] README: document `git submodule update --init --recursive`
- [x] Wire workspace references for local imports

**PR:** <!-- link when merged -->

### agent-runtime-port

Define the `AgentRuntime` interface and implement the `local` backend.

- [x] `AgentRuntime` interface (`runTurn` → async iterable events) — `packages/agent-runtime/src/types.ts`
- [x] `resolveRuntime(profile)` function — `packages/agent-runtime/src/resolve-runtime.ts`
- [x] `local` backend (Vercel AI SDK → Ollama) — `packages/agent-runtime/src/backends/local.ts`
- [x] Privacy profile config shape (`runtime`, `model`, `egress`, `tools`) — `PrivacyProfile` in `types.ts`; `parseModelRef` / `mergeProfile` in `profile.ts`
- [x] Default profile: `local` + `egress: deny` — `DEFAULT_PRIVACY_PROFILE` in `profile.ts`
- [x] Unit tests with mocked model — `profile.test.ts`, `resolve-runtime.test.ts`, `egress.test.ts`, `local.test.ts` (mock stream via `MockLanguageModelV1`)
- [x] Optional Ollama integration test — opt in with `JERRY_OLLAMA_TEST=1`; override model via `JERRY_OLLAMA_MODEL` (e.g. `gemma3:4b`)

**PR:** <!-- link when merged -->

### target-config

Wire the `mieweb` CLI and target configuration files.

- [x] `mieweb.jsonc` — default target `local`, D1+KV bindings (repo root)
- [x] `wrangler.jsonc` — Cloudflare target stub with D1+KV (repo root)
- [x] Hook packages to `@mieweb/cloud` local harness — `@mieweb/cli` + `@mieweb/cloud-local` deps, `pnpm dev` starts Jerry on `:8787`
- [x] Minimal worker — `packages/jerry-app/worker/index.mjs` with `/`, `/health`, `/hits` routes

**PR:** <!-- link when merged -->

### aw-pure-functions

Implement ActivityWatch aggregation pure functions in `packages/tools`.

- [x] `buildActivitySummary` — `packages/tools/src/aw/build-summary.ts`
- [x] `resolveActivityRange` — `packages/tools/src/aw/intent.ts`
- [x] `resolveRangeHours` — `packages/tools/src/aw/intent.ts`
- [x] `pickBucket` — `packages/tools/src/aw/build-summary.ts`
- [x] `formatActivityContext` — `packages/tools/src/aw/format.ts`
- [x] `isWorkRelatedUrl` — `packages/tools/src/aw/aggregate.ts`
- [x] `aggregateMeetingSessions` — `packages/tools/src/aw/aggregate.ts`
- [x] `aggregateTopActivities` / `aggregateTopWebLinks` — `packages/tools/src/aw/aggregate.ts`
- [x] Full unit test coverage with fixtures — 99 tests across `aggregate.test.ts`, `intent.test.ts`, `build-summary.test.ts`, `format.test.ts`, `pipeline.test.ts`

**PR:** <!-- link when merged -->

## Phase 0 Complete

All slices implemented. Phase 1 readiness confirmed.

## Done when

- `pnpm install` succeeds from clean clone
- `pnpm run ci` passes (typecheck + lint + test)
- Submodules init cleanly
- `resolveRuntime({ runtime: "local", egress: "deny", ... })` talks to Ollama
- All AW pure functions pass fixture-based unit tests
