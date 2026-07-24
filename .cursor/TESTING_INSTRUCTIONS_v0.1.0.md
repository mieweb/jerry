# jerry-term v0.1.0 Testing Instructions

This document provides comprehensive testing instructions for reviewers and contributors testing the jerry-term v0.1.0 release.

## Quick Smoke Test (10-15 min)

```bash
# 1. Clone and setup
git clone https://github.com/mieweb/jerry.git
cd jerry
git checkout phase3/jerry-term
git submodule update --init --recursive
pnpm install

# 2. Build and verify
cd packages/jerry-term
pnpm build && pnpm typecheck && pnpm test

# 3. Test CLI flags
node bin/jerry-term.js --version  # Should show v0.1.0
node bin/jerry-term.js --help     # Should show usage
node bin/jerry-term.js --health   # Should show system status

# 4. Test development mode (requires Bun)
pnpm dev  # Full-screen UI, press Ctrl+C to exit

# 5. Test packaged version
npm pack
npm i -g ./jerry-term-0.1.0.tgz
jerry-term --version
npm uninstall -g jerry-term
```

## Prerequisites

- Node.js >= 22.16.0
- Bun 1.3+ (for interactive UI): `curl -fsSL https://bun.sh/install | bash`
- Ollama (for local runtime testing): `ollama pull qwen2.5:3b`
- ActivityWatch optional (for tool testing)

## Testing Different Runtimes

### 1. Local Runtime (Ollama)

```bash
# Start Ollama (if not already running)
ollama serve

# Pull a model
ollama pull qwen2.5:3b

# Test jerry-term
jerry-term -r local

# In the REPL:
# 1. Type: "hello, introduce yourself"
# 2. Press Ctrl+T to see tool panel
# 3. Press Ctrl+K to see thinking panel
# 4. Type: /model to see available models
# 5. Press Ctrl+C to exit
```

### 2. Ozwell Runtime

```bash
# Set API key
export OZWELL_API_KEY=ozw_...

# Test jerry-term
jerry-term -r ozwell

# In the REPL:
# 1. Type: "hello, introduce yourself"
# 2. Type: /model to see curated model list
# 3. Select a model from the picker
# 4. Test a query with the new model
# 5. Press Ctrl+C to exit
```

### 3. BYO-Cloud Runtime (OpenAI)

```bash
# Set API key
export OPENAI_API_KEY=sk-...

# Test jerry-term
jerry-term -r byo-cloud

# In the REPL:
# 1. Type: "hello, introduce yourself"
# 2. Type: /model to see OpenAI models
# 3. Select a model (e.g., gpt-4o)
# 4. Test a query
# 5. Press Ctrl+C to exit
```

### 4. Anthropic Runtime

```bash
# Set API key
export ANTHROPIC_API_KEY=sk-ant-...

# Test jerry-term
jerry-term -r anthropic

# In the REPL:
# 1. Type: "hello, introduce yourself"
# 2. Type: /model to see Claude models
# 3. Select a model (e.g., claude-sonnet-4)
# 4. Test a query
# 5. Press Ctrl+C to exit
```

## Testing One-Shot Mode (Scriptable)

```bash
# Basic query
jerry-term "hello"

# With verbose output
jerry-term --verbose "what is 2+2?"

# Pipe to file
jerry-term "tell me a haiku" > haiku.txt

# With specific runtime
jerry-term -r local "explain quantum computing in one sentence"

# With specific model
jerry-term -r anthropic --model claude-sonnet-4-20250514 "what is the capital of France?"
```

## Testing CLI Flags

```bash
# Version
jerry-term --version
# Expected: jerry-term v0.1.0

# Help
jerry-term --help
# Expected: Full help text with options and examples

# Health check
jerry-term --health
# Expected: System diagnostics (Ollama, ActivityWatch, config status)

# No-UI mode (basic REPL)
jerry-term --no-ui
# Expected: Simple text-based REPL without OpenTUI

# Custom config path
echo '{"runtime":"local","model":"qwen2.5:3b"}' > /tmp/test-config.json
jerry-term --config /tmp/test-config.json
# Expected: Uses config from /tmp/test-config.json

# Verbose mode
jerry-term --verbose "hello"
# Expected: Debug output showing tool calls and events
```

## Testing Tree Picker

```bash
# Start jerry-term
jerry-term

# Test runtime picker:
# 1. Type: /runtime
# 2. Use arrow keys to navigate
# 3. Press Enter to select
# 4. Press Esc to cancel

# Test model picker:
# 1. Type: /model
# 2. Navigate through model list
# 3. Select a model
# 4. Verify header updates with new model

# Test in-picker API key setup:
# 1. Start jerry-term without API keys set
# 2. Type: /runtime
# 3. Select Ozwell or Anthropic
# 4. Picker should prompt for API key
# 5. Enter API key (will be masked)
# 6. Verify key is saved in ~/.config/jerry-term/config.json
```

## Testing Credentials Vault

```bash
# Check config file
cat ~/.config/jerry-term/config.json
# Expected: See stored credentials with proper structure

# Test masked key display:
# 1. Start jerry-term
# 2. Type: /config
# 3. Verify API keys are masked (e.g., sk-pr****abcd)

# Test clearKey command:
# 1. Type: /config clearKey ozwell
# 2. Verify key is removed from config
# 3. Type: /config to confirm

# Test key persistence:
# 1. Add an API key via picker
# 2. Exit jerry-term
# 3. Start jerry-term again
# 4. Verify key is still set (type: /config)
```

## Testing Commands

```bash
# Start jerry-term
jerry-term

# Test each command:
/help        # Show help
/runtime     # Open runtime picker
/rt          # Alias for /runtime
/model       # Open model picker
/m           # Alias for /model
/config      # Show current config
/health      # Run health checks
/aw-tail     # Show ActivityWatch events (if AW is running)
/exit        # Exit (or press Ctrl+C)
```

## Testing Keyboard Shortcuts

```bash
# Start jerry-term
jerry-term

# Test shortcuts:
# Ctrl+T  - Toggle tools panel
# Ctrl+K  - Toggle thinking panel
# Ctrl+L  - Clear conversation
# Ctrl+C  - Cancel current turn / Exit
```

## Testing OpenTUI Interface

### 1. Header
- Verify displays current runtime and model
- Should update when runtime/model changes

### 2. Thinking Panel (Ctrl+K)
- Toggle visibility with Ctrl+K
- Should show "Thinking..." during inference
- Should show "Idle" when not active

### 3. Tools Panel (Ctrl+T)
- Toggle visibility with Ctrl+T
- Should show tool execution tree
- Should display timing information
- Should show status icons (✓, ✗, ⏳)

### 4. Response Area
- Should display conversation history
- Should scroll automatically
- Should handle long responses

### 5. Status Bar
- Should show connection state
- Should show tool progress
- Should update in real-time

## Testing Package Installation

```bash
# From packages/jerry-term directory
npm pack
# Expected: Creates jerry-term-0.1.0.tgz

# Install globally
npm i -g ./jerry-term-0.1.0.tgz
# Expected: Installs successfully

# Test installed version
jerry-term --version
# Expected: v0.1.0

# Test installed CLI
jerry-term "hello"
# Expected: Works correctly

# Uninstall
npm uninstall -g jerry-term
# Expected: Removes successfully
```

## Testing Bun Compatibility

```bash
# Install Bun (if not installed)
curl -fsSL https://bun.sh/install | bash

# Run with Bun
bun run packages/jerry-term/src/cli.ts --version
# Expected: v0.1.0

# Development mode with Bun
cd packages/jerry-term
bun run src/cli.ts
# Expected: Full-screen UI works

# One-shot with Bun
bun run src/cli.ts "hello"
# Expected: Works correctly
```

## Comprehensive Testing Checklist

### Build & Quality
- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes (0 errors)
- [ ] `pnpm test` passes (240/240 tests)
- [ ] `npm publish --dry-run` succeeds
- [ ] No linter errors

### CLI Flags
- [ ] `--version` shows v0.1.0
- [ ] `--help` shows full help text
- [ ] `--health` runs diagnostics
- [ ] `--verbose` shows debug output
- [ ] `--no-ui` uses basic REPL
- [ ] `--config <path>` uses custom config
- [ ] `-r <runtime>` sets initial runtime
- [ ] `--model <id>` sets initial model

### Runtimes
- [ ] Local (Ollama) works
- [ ] Ozwell works
- [ ] BYO-Cloud (OpenAI) works
- [ ] Anthropic works
- [ ] Runtime switching works
- [ ] Model switching works within runtime

### Picker
- [ ] Runtime picker opens and navigates
- [ ] Model picker opens and navigates
- [ ] Live model listing works for all providers
- [ ] API key setup flow works
- [ ] Last model memory persists

### Credentials Vault
- [ ] Keys save to config file
- [ ] Keys display masked in UI
- [ ] `/config clearKey` removes keys
- [ ] Keys persist across sessions
- [ ] File permissions are secure (0600)

### Commands
- [ ] `/help` works
- [ ] `/runtime` and `/rt` work
- [ ] `/model` and `/m` work
- [ ] `/config` shows config
- [ ] `/config clearKey` works
- [ ] `/health` works
- [ ] `/aw-tail` works (if AW running)
- [ ] `/exit` works

### UI
- [ ] Header displays correctly
- [ ] Thinking panel toggles (Ctrl+K)
- [ ] Tools panel toggles (Ctrl+T)
- [ ] Response area displays messages
- [ ] Status bar updates
- [ ] Keyboard shortcuts work
- [ ] Ctrl+C cancels/exits

### One-Shot Mode
- [ ] Basic query works
- [ ] Verbose mode works
- [ ] Piping to file works
- [ ] Runtime flag works
- [ ] Model flag works
- [ ] Exit code is 0 on success

### Installation
- [ ] `npm pack` creates tarball
- [ ] Global install works
- [ ] `jerry-term` command available after install
- [ ] Uninstall works cleanly

### Compatibility
- [ ] Node.js 22+ works
- [ ] Bun 1.3+ works
- [ ] Works on macOS
- [ ] Works on Linux (optional)
- [ ] Works on Windows (optional)

## Known Issues to Verify

### 1. Sticky TUI / Transcript Scroll
- [ ] Can reproduce scroll issue in some terminals
- [ ] `PgUp`/`PgDown` workaround works
- [ ] `--no-ui` workaround works

### 2. Ozwell Model Compatibility
- [ ] Recommended models work
- [ ] Other models may not work (expected)

## Reporting Issues

If you encounter any issues during testing:

1. Note the exact steps to reproduce
2. Capture error messages or screenshots
3. Include system information (OS, Node version, terminal emulator)
4. Check known limitations in RELEASE_NOTES_v0.1.0.md first
5. Report in PR comments or create a new issue
