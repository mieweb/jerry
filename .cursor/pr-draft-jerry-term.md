# Phase 3: jerry-term Interactive Terminal CLI

![jerry-term v0.1.0](packages/jerry-term/v0.1.0-title.png)

## Summary

This PR delivers **jerry-term v0.1.0**, a standalone interactive terminal CLI for Jerry AI agent with a rich OpenTUI-based interface. jerry-term provides a complete, installable package (`npm i -g jerry-term`) that bundles all Jerry functionality without requiring the worker to be running.

## What's New

### Three Runtime Backends
- **Local (Ollama)** — Fully offline, nothing leaves the machine
- **Ozwell** — Managed cloud provider with curated model access
- **BYO-Cloud** — Bring your own API keys for:
  - OpenAI (GPT models)
  - Anthropic (Claude models)
  - Other providers

All backends use the same tool loop (ActivityWatch, search, etc.) with runtime-switchable model endpoints.

**📋 For detailed feature list and known limitations, see [RELEASE_NOTES_v0.1.0.md](.cursor/RELEASE_NOTES_v0.1.0.md)**

## Quality Assurance

### Green Gates ✅
- `pnpm build` — Passes, `dist/index.d.ts` emits correctly
- `pnpm typecheck` — Passes, 0 errors
- `pnpm test` — Passes, 240/240 tests (100%)
- No linter errors

### Publish Readiness ✅
- `npm publish --dry-run` — Succeeds (209.8 kB tarball, 12 files)
- `npm pack` — Verified tarball contents
- CLI smoke tests — `--version`, `--help`, `--health` all working
- Bun compatibility — Verified with Bun 1.3.4
- Local install tested — `npm i -g ./jerry-term-*.tgz` works

### Documentation ✅
- Complete README with all three runtimes
- User guide: `docs/jerry-term.md`
- CHANGELOG for 0.1.0 release
- Screenshot added to README
- Publish workflow: `.github/workflows/publish-jerry-term.yml`

## Testing Instructions

**📋 See [TESTING_INSTRUCTIONS_v0.1.0.md](.cursor/TESTING_INSTRUCTIONS_v0.1.0.md) for comprehensive step-by-step testing instructions.**

**📝 See [RELEASE_NOTES_v0.1.0.md](.cursor/RELEASE_NOTES_v0.1.0.md) for complete feature list, known limitations, and roadmap.**

## Security Considerations

### API Key Storage
- Keys stored in plaintext in `~/.config/jerry-term/config.json`
- File permissions: `0600` (user read/write only)
- Keys masked in UI: `sk-pr****abcd`
- No keys sent to telemetry or logs

## Deployment

### Pre-Publish Checklist (Owner)
- [ ] Review PR and approve
- [ ] Merge to `development`
- [ ] Merge `development` to `main`
- [ ] Trigger `.github/workflows/publish-jerry-term.yml` (manual workflow dispatch)
- [ ] Verify `npm i -g jerry-term` works on clean machine
- [ ] Announce release

### Post-Publish
- Update root README with `npm i -g jerry-term` instructions
- Create GitHub release with CHANGELOG
- Announce on relevant channels

