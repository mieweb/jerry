# Changelog

All notable changes to jerry-term will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-23

Initial release of jerry-term, the interactive terminal CLI for Jerry AI agent.

### Added

#### Core Features
- Full-screen OpenTUI-based terminal interface with observability panels
- Four runtime backends: Local (Ollama), Ozwell, BYO-Cloud (OpenAI), and Anthropic
- Interactive tree picker for runtime and model selection with live model listing
- Credentials vault for secure API key storage (`~/.config/jerry-term/config.json`)
- Masked API key display (`sk-pr****abcd`) throughout the UI
- Last model memory per runtime/provider
- One-shot query mode (`jerry-term "message"`) for scripting
- Basic REPL mode (`--no-ui`) for Node.js compatibility

#### Commands
- `/runtime` (`/rt`) — Runtime picker or direct switch
- `/model` (`/m`) — Model picker or direct set
- `/config` (`/cfg`) — View/update configuration with persistence
- `/config clearKey [provider]` — Remove saved API keys
- `/health` (`/hc`) — System health checks
- `/aw-tail` (`/aw`) — ActivityWatch event viewer
- `/help`, `/exit`

#### UI Components
- Thinking panel with inference status
- Tools panel with real-time execution tree, timing, and status icons
- Response area with conversation history
- Status bar with connection state and tool progress
- Keyboard shortcuts for panel toggle, expand/collapse, clear

#### CLI Flags
- `-v, --version` — Show version
- `-h, --help` — Show help
- `-r, --runtime <kind>` — Set initial runtime
- `--model <id>` — Set initial model
- `-H, --health` — Run health diagnostics
- `--verbose` — Enable debug output
- `--no-ui` — Use basic REPL
- `--config <path>` — Custom config file

#### Runtime Features
- Live model listing from Ollama, Ozwell, OpenAI, and Anthropic APIs
- Curated model recommendations for Ozwell (recommended models first)
- API key validation on setup
- Automatic fallback to local runtime when cloud unavailable

#### Tools
- `summarize_activity` — Full implementation via ActivityWatch HTTP API
- Stub implementations for worker-dependent tools

### Known Issues
- Sticky TUI / transcript scroll in some terminal emulators
- Ozwell model compatibility needs verification for non-chat model types

---

## Development History

This release incorporates work from Phase 3 development slices:

- **Slice 1**: Project scaffold and build setup
- **Slice 2**: JerryBridge abstraction layer
- **Slice 3**: Health check system
- **Slice 4**: Basic REPL implementation
- **Slice 4.5**: Local tool implementations
- **Slice 5**: Migration from Ink to OpenTUI framework
- **Slice 6**: Observability panels (thinking, tools, tree view)
- **Slice 6.5**: Config fidelity for Ozwell and OpenAI BYO
- **Slice 6.6**: Runtime/model tree picker with credentials vault
- **Slice 6.6.1**: Anthropic runtime, live model listing, masked keys
- **Slice 7**: Polish, CLI parsing, documentation, publish preparation
