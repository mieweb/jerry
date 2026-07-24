# jerry-term v0.1.0 Release Notes

**Release Date:** July 2026

## Overview

First stable release of jerry-term, a standalone interactive terminal CLI for Jerry AI agent with a rich OpenTUI-based interface. This release provides a complete, installable package (`npm i -g jerry-term`) that bundles all Jerry functionality without requiring the worker to be running.

## New Features

### Interactive Tree Picker
- Navigate runtimes and models with keyboard (`↑↓ Enter Esc`)
- Live model listing from Ollama, Ozwell, OpenAI, and Anthropic APIs
- Curated recommendations (Ozwell shows recommended models first)
- In-picker API key setup flow
- Last model memory per runtime/provider

### Credentials Vault
- Secure storage in `~/.config/jerry-term/config.json`
- Masked key display (`sk-pr****abcd`) throughout UI
- Per-provider credential slots: `credentials.ozwell`, `credentials.byo.{openai,anthropic}`
- `/config clearKey [provider]` management

### Full-Screen OpenTUI Interface
- **Header** — Current runtime and model
- **Thinking Panel** — Real-time inference status
- **Tools Panel** — Execution tree with timing and status icons
- **Response Area** — Conversation history
- **Status Bar** — Connection state and tool progress
- Keyboard shortcuts: `Ctrl+T` (tools), `Ctrl+K` (thinking), `Ctrl+L` (clear), `Ctrl+C` (cancel/exit)

### CLI Features
- One-shot mode: `jerry-term "summarize my day"` (headless, scriptable)
- Full argument parsing: `-v/--version`, `-h/--help`, `-r/--runtime`, `--model`, `--verbose`, `--no-ui`, `--config`
- Health diagnostics: `jerry-term --health`
- Basic REPL mode: `jerry-term --no-ui` (Node.js compatible)

### Commands
- `/runtime` (`/rt`) — Runtime picker or direct switch
- `/model` (`/m`) — Model picker or direct set
- `/config` — View/update configuration with persistence
- `/config clearKey [provider]` — Remove saved API keys
- `/health` — System health checks
- `/aw-tail` — ActivityWatch event viewer
- `/help`, `/exit`

## Known Limitations

### Open Issues

#### 1. Sticky TUI / Transcript Scroll (Unsolved)
**Status:** Known issue, no immediate fix.

The full-screen UI may conflict with terminal scrollback in some emulators. The in-app transcript may not receive mouse wheel events.

**Workarounds:**
- Use `PgUp`/`PgDown` or `Shift+↑`/`Shift+↓` for transcript scrolling
- Try different terminals (Kitty, Ghostty, WezTerm, Alacritty, iTerm2)
- Use `--no-ui` for non-fullscreen REPL

**Impact:** Moderate — affects UX but doesn't block core functionality.

#### 2. Ozwell Model Compatibility
**Status:** Needs verification.

Ozwell Manager `/v1/models` returns a large catalog (chat + embeddings/TTS/image/realtime). Not all models are Jerry-compatible (tool calling, SSE streaming).

**Current State:** Curated "recommended" list in picker; others collapsed under "Other models"

**Action Required:** Verify which models work end-to-end with Jerry's Ozwell chat/streaming path under typical `ozw_` key policies.

**Impact:** Low — Recommended models work; advanced users may encounter incompatible models in "Other" section.

### Architecture Limitations

#### No Worker-Dependent Tools
jerry-term runs in-process (no cloud worker). Only `summarize_activity` is fully implemented via direct ActivityWatch HTTP API. Other tools return stub messages.

**Affected tools:**
- `search_memory` (requires worker)
- `schedule_followup` (requires worker)
- `read_file` (requires worker)
- `list_watched` (requires worker)
- `index_document` (requires worker)

**Impact:** Medium — Reduces functionality compared to `jerry` CLI with worker.

#### No Session Persistence
No conversation history saved between sessions. Each `jerry-term` run starts fresh.

**Impact:** Low — Most users treat terminal sessions as ephemeral.

## Development History

This release represents the culmination of Phase 3 development across multiple slices:

- **Slice 1**: Project scaffold, build setup, package structure
- **Slice 2**: JerryBridge abstraction layer for runtime switching
- **Slice 3**: Health check system (Ollama, ActivityWatch, Footnote, MCP)
- **Slice 4**: Basic REPL implementation with command registry
- **Slice 4.5**: Local tool implementations (`summarize_activity` via AW HTTP)
- **Slice 5**: Migration from Ink to OpenTUI framework
- **Slice 6**: Observability panels (thinking, tools, tree view with timing)
- **Slice 6.5**: Config fidelity for Ozwell and OpenAI BYO runtimes
- **Slice 6.6**: Runtime/model tree picker with credentials vault
- **Slice 6.6.1**: Anthropic runtime, live model listing, masked keys
- **Slice 7**: Polish, CLI parsing, documentation, publish preparation

## Files Changed

**17 files changed, +900/-176 lines**

### New Files
- `packages/jerry-term/src/cli.ts` — CLI argument parser and entry point
- `packages/jerry-term/CHANGELOG.md` — Release history
- `docs/jerry-term.md` — User guide
- `.github/workflows/publish-jerry-term.yml` — Publish workflow (manual trigger, org NPM_TOKEN)
- `packages/jerry-term/v0.1.0-title.png` — Screenshot

### Modified Files
- `packages/jerry-term/README.md` — Complete documentation for all runtimes
- `packages/jerry-term/src/index.ts` — Refactored to use CLI module
- `packages/jerry-term/src/config/loader.ts` — Added JERRY_TERM_CONFIG env override
- `packages/jerry-term/src/config/config.test.ts` — Hermetic tests, anthropic support
- `packages/jerry-term/src/ui/components/RuntimePicker.tsx` — Type fixes
- Root `README.md` — Link to jerry-term docs
- `docs/plans/phase-3.md` — Updated with completed work

## Security Considerations

### API Key Storage
- Keys stored in plaintext in `~/.config/jerry-term/config.json`
- File permissions: `0600` (user read/write only)
- Keys masked in UI: `sk-pr****abcd`
- No keys sent to telemetry or logs

### Future: OS Keychain (0.2.0)
Plan to integrate with OS-native secure storage in 0.2.0.

## Breaking Changes

None. This is the initial 0.1.0 release.

## Migration Guide

N/A — First release.

## Roadmap: v0.2.0 (Phase 3.1)

### Planned Features

#### 1. Cloud Worker Integration
- **Goal:** Connect jerry-term to the Jerry worker for full tool access
- **Features:**
  - `JERRY_URL` environment variable (points to `http://localhost:8787` or cloud worker)
  - `/enqueue` command for offloading long-running tasks to worker queue
  - Full `search_memory`, `read_file`, `index_document` support
  - Worker health check in `--health` diagnostics
- **Design:** Reuse patterns from main `jerry` CLI (no embedded worker, just HTTP client)

#### 2. Session Resume (`-s <session-id>`)
- **Goal:** Resume previous conversations
- **Features:**
  - Session ID in status bar
  - `-s <session-id>` CLI flag to attach to existing session
  - Session listing: `jerry-term --list-sessions`
  - Transcript persistence (worker-backed or local SQLite)
- **Dependencies:** Cloud worker client integration (Phase 3.1)

#### 3. Local Session Persistence (Optional)
- **Goal:** Save conversation history without requiring worker
- **Features:**
  - SQLite-backed transcript storage in `~/.config/jerry-term/sessions/`
  - `/save [name]` and `/load [name]` commands
  - Session management UI
- **Note:** Separate from cloud resume; can coexist

#### 4. Additional BYO Providers
- **Moonshot (Kimi)** — Chinese market LLM provider
- **Custom endpoints** — User-defined OpenAI-compatible APIs
- **Azure OpenAI** — Enterprise deployments
- **Groq** — Fast inference provider

#### 5. Enhanced Picker Features
- **Model search/filter** in picker (for providers with 50+ models)
- **Model tagging** (reasoning, vision, fast, etc.)
- **Cost estimation** display per model
- **Provider health indicators** (latency, availability)

#### 6. Configuration Improvements
- **OS keychain integration** (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- **Config profiles** (`~/.config/jerry-term/profiles/work.json`, `personal.json`)
- **Profile switching**: `jerry-term --profile work`
- **Shared team configs** (`.jerry-term.json` in project root)

### Post-0.2.0 Considerations

#### Mobile & Web
- **React Native** thin client (share bridge logic)
- **Web UI** (OpenTUI patterns may inform terminal-in-browser design)

#### Extensibility
- **Plugin system** — Community commands via npm packages
- **Custom themes** — Color schemes in config file
- **Hook system** — Before/after turn, on tool call, etc.

#### Advanced Features
- **Multi-turn memory** — Automatic context management
- **Tool approval flow** — Confirm before executing sensitive tools
- **Transcript export** — Markdown, JSON, HTML formats
- **Collaborative sessions** — Multiple users on same session (requires worker)
