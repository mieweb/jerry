# jerry-term

Interactive terminal CLI for Jerry AI agent with a rich OpenTUI-based UI.

## Installation

```bash
npm i -g jerry-term
```

Or run directly from the monorepo:

```bash
pnpm --filter jerry-term dev
```

## Quick Start

```bash
# Start the interactive UI
jerry-term

# Check version
jerry-term --version
jerry-term -V

# Run health diagnostics
jerry-term --health
jerry-term -H

# Use legacy readline REPL (no OpenTUI)
jerry-term --no-ui
```

## UI Overview

jerry-term provides a full-screen terminal UI with four main sections:

```
┌─────────────────────────────────────────────────────────────────┐
│ ● jerry-term v0.1.0                  [local] ollama:qwen2.5:3b  │  ← Header
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Based on your ActivityWatch data, you spent most of your time  │  ← Response Area
│ in VS Code working on the jerry-term project...                │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ > _                                                             │  ← Input Prompt
├─────────────────────────────────────────────────────────────────┤
│ ● Connected • Last: 2.3s • Tools: 6                            │  ← Status Bar
└─────────────────────────────────────────────────────────────────┘
```

- **Header**: Shows connection status, current runtime, and model
- **Response Area**: Displays conversation with Jerry (user input, assistant responses, tool calls)
- **Input Prompt**: Type messages or commands here
- **Status Bar**: Shows connection state, last response time, and available tools

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Submit input |
| `↑` / `↓` | Navigate command history |
| `Scroll` | Mouse/trackpad scroll in transcript area |
| `Ctrl+L` | Clear transcript |
| `Ctrl+C` | Cancel current turn (if busy) or exit |

## Built-in Commands

All commands start with `/`:

| Command | Aliases | Description |
|---------|---------|-------------|
| `/runtime <kind>` | `/rt` | Switch runtime: `local`, `ozwell`, `byo-cloud` |
| `/health` | `/hc` | Run system health checks |
| `/config [key] [value]` | `/cfg` | View or update configuration |
| `/help [command]` | `/h`, `/?` | Show help |
| `/exit` | `/q`, `/quit` | Exit the CLI |

### Examples

```bash
# Switch to Ozwell runtime
> /runtime ozwell

# Check system health
> /health

# View current configuration
> /config

# Set a specific config value
> /config model gpt-4.1-mini

# Get help on a specific command
> /help runtime
```

## Chatting with Jerry

Simply type your message and press Enter:

```
> summarize my work from yesterday

Based on your ActivityWatch data, yesterday you spent approximately 6 hours
working across several projects...

> what were the main themes?

The main themes from your work yesterday were:
1. Documentation and planning (2.5 hours)
2. Code implementation (2 hours)
...
```

## Runtime Configuration

jerry-term supports three runtime backends:

### 1. Local (Ollama) — Default

Nothing leaves the machine except localhost Ollama calls.

```bash
JERRY_RUNTIME=local \
  JERRY_MODEL=ollama:qwen2.5:3b \
  jerry-term
```

**Requirements**: Ollama must be running at `http://127.0.0.1:11434`

### 2. Ozwell (Cloud)

Uses Ozwell as the cloud model provider.

```bash
JERRY_RUNTIME=ozwell \
  JERRY_MODEL=gpt-4.1-mini \
  OZWELL_API_KEY=ozw_your_key \
  jerry-term
```

If Ozwell is unavailable, jerry-term falls back to local Ollama automatically.

### 3. BYO-Cloud (Custom OpenAI-compatible endpoint)

```bash
JERRY_RUNTIME=byo-cloud \
  JERRY_MODEL='https://api.openai.com/v1#gpt-4o' \
  OPENAI_API_KEY=sk-... \
  jerry-term
```

## Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `JERRY_RUNTIME` | Runtime backend | `local`, `ozwell`, `byo-cloud` |
| `JERRY_MODEL` | Model identifier | `ollama:qwen2.5:3b`, `gpt-4.1-mini` |
| `OZWELL_API_KEY` | Ozwell API key | `ozw_...` |
| `OZWELL_ENDPOINT` | Ozwell API endpoint | `https://ozwellapi.os.mieweb.org` |
| `OPENAI_API_KEY` | OpenAI/BYO-cloud API key | `sk-...` |
| `JERRY_ENDPOINT` | Custom API endpoint | `https://...` |

## Config File

jerry-term looks for configuration in these locations (in order):

1. `./.jerry-term.json` (current directory)
2. `~/.config/jerry-term/config.json`
3. `~/.jerry-term.json`

Example config file:

```json
{
  "runtime": "local",
  "model": "ollama:qwen2.5:3b"
}
```

## Available Tools

jerry-term includes local tool implementations that work without the Jerry worker:

| Tool | Description | Status |
|------|-------------|--------|
| `summarize_activity` | Summarize ActivityWatch data | Full (calls AW HTTP API) |
| `search_memory` | Search semantic memory | Stub (requires worker) |
| `schedule_followup` | Schedule reminders | Stub (requires worker) |
| `read_file` | Read file contents | Stub (requires worker) |
| `list_watched` | List watched directories | Stub (requires worker) |
| `index_document` | Index a document | Stub (requires worker) |

**Note**: `summarize_activity` works fully in standalone mode by calling the ActivityWatch HTTP API directly. Other tools return helpful messages indicating they require the Jerry worker.

## Health Checks

Run `/health` or `jerry-term --health` to check system dependencies:

```
jerry-term health check
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Ollama            Running (245ms)
⚠ ActivityWatch     Not running - activity features unavailable
✓ Footnote          Index found (12ms)
✓ MCP Tools         Disabled

Overall: degraded
```

Status indicators:
- `✓` (green) — OK
- `⚠` (yellow) — Warning (optional service)
- `✗` (red) — Error (required service)

## Development

jerry-term uses [OpenTUI](https://opentui.com/) for the terminal UI, which requires **Bun** runtime for the interactive UI.

```bash
# Install dependencies
pnpm install

# Run in development mode (requires Bun for UI)
pnpm --filter jerry-term dev

# Run with Node.js (readline REPL only)
pnpm --filter jerry-term dev:node

# Build
pnpm --filter jerry-term build

# Run tests
pnpm --filter jerry-term test

# Type check
pnpm --filter jerry-term typecheck

# Local install for testing
cd packages/jerry-term
npm link
jerry-term --version
```

### Runtime Requirements

- **Bun 1.3+**: Required for the interactive OpenTUI interface
- **Node.js 22+**: Supported for `--no-ui` readline mode only

## Troubleshooting

### "Ollama not running"

Start Ollama and ensure it's accessible at `http://127.0.0.1:11434`:

```bash
ollama serve
# In another terminal:
curl http://127.0.0.1:11434/api/tags
```

### "ActivityWatch not running"

ActivityWatch is optional but needed for `summarize_activity`. Install and start it:

1. Download from [activitywatch.net](https://activitywatch.net/)
2. Start the ActivityWatch tray application
3. Verify: `curl http://127.0.0.1:5600/api/0/info`

### UI rendering issues

If the UI doesn't render correctly:
- Ensure you're running with **Bun** (not Node.js) for the interactive UI
- Ensure your terminal supports truecolor (256+ colors)
- Try a modern terminal emulator (Kitty, Ghostty, WezTerm, Alacritty, iTerm2)
- Use `--no-ui` flag for the legacy readline REPL (works with Node.js)

### Ozwell fallback

If you see `[jerry] Ozwell unavailable...`, jerry-term will automatically fall back to local Ollama. Check:
- Your `OZWELL_API_KEY` is valid
- The Ozwell endpoint is reachable

## License

MIT
