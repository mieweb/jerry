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

- [ ] `AgentRuntime` interface (`runTurn` → async iterable events)
- [ ] `resolveRuntime(profile)` function
- [ ] `local` backend (Vercel AI SDK → Ollama)
- [ ] Privacy profile config shape (`runtime`, `model`, `egress`, `tools`)
- [ ] Default profile: `local` + `egress: deny`
- [ ] Unit tests with mocked model

**PR:** <!-- link when merged -->

### target-config

Wire the `mieweb` CLI and target configuration files.

- [ ] `mieweb.jsonc` — default target `local`
- [ ] `wrangler.jsonc` — Cloudflare target stub
- [ ] Hook packages to `@mieweb/cloud` local harness

**PR:** <!-- link when merged -->

### aw-pure-functions

Implement ActivityWatch aggregation pure functions in `packages/tools`.

- [ ] `buildActivitySummary`
- [ ] `resolveActivityRange`
- [ ] `resolveRangeHours`
- [ ] `pickBucket`
- [ ] `formatActivityContext`
- [ ] `isWorkRelatedUrl`
- [ ] `aggregateMeetingSessions`
- [ ] `aggregateTopActivities` / `aggregateTopWebLinks`
- [ ] Full unit test coverage with fixtures

**PR:** <!-- link when merged -->

## Done when

- `pnpm install` succeeds from clean clone
- `pnpm ci` passes (typecheck + lint + test)
- Submodules init cleanly
- `resolveRuntime({ runtime: "local", egress: "deny", ... })` talks to Ollama
- All AW pure functions pass fixture-based unit tests
