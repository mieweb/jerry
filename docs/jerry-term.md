# jerry-term User Guide

A comprehensive guide to using jerry-term, the interactive terminal CLI for Jerry AI agent.

## Overview

jerry-term provides a rich terminal interface for interacting with the Jerry AI agent. It supports multiple runtime backends, a credentials vault for API keys, an interactive tree picker for runtime/model selection, and both interactive and one-shot query modes.

## Installation

```bash
npm i -g jerry-term
```

Or from the monorepo:
```bash
pnpm --filter jerry-term build
npm link
```

## Quick Start

### Interactive Mode

Simply run `jerry-term` to start the interactive UI:

```bash
jerry-term
```

This launches a full-screen terminal UI with:
- **Header**: Current runtime and model
- **Thinking Panel**: Shows inference status
- **Tools Panel**: Real-time tool execution with timing
- **Response Area**: Conversation history
- **Input Prompt**: Type messages or commands

### One-Shot Mode

Run a single query and exit:

```bash
jerry-term "summarize my work from yesterday"
```

The output is printed to stdout, making it suitable for scripting:

```bash
# Pipe to another command
jerry-term "list my meetings today" | grep -i "standup"

# Save to file
jerry-term "generate a status report" > report.md
```

Use `--verbose` to see tool calls:
```bash
jerry-term --verbose "what did I work on?"
```

## Runtime Configuration

jerry-term supports four runtime backends:

### Local (Ollama) — Default

Runs entirely on your machine using Ollama. Nothing leaves localhost.

```bash
jerry-term -r local
```

**Requirements**: Ollama running at `http://127.0.0.1:11434`

### Ozwell (Managed Cloud)

Uses Ozwell as a managed cloud provider with curated model access.

```bash
# Via CLI
jerry-term -r ozwell

# Or interactively
> /runtime ozwell
```

**Setup**: Set `OZWELL_API_KEY` environment variable or use the runtime picker to enter your key.

Docs: https://mieweb.github.io/ozwellai-api/backend/api-authentication/

### BYO-Cloud (OpenAI)

Use your own OpenAI API key.

```bash
jerry-term -r byo-cloud --model gpt-4o
```

**Setup**: Set `OPENAI_API_KEY` or use the runtime picker.

### Anthropic (Claude)

Native Anthropic API support for Claude models.

```bash
jerry-term -r anthropic --model claude-sonnet-4-20250514
```

**Setup**: Set `ANTHROPIC_API_KEY` or use the runtime picker.

## The Runtime and Model Picker

Use `/runtime` or `/model` without arguments to open the interactive picker:

```
> /runtime

┌─ Select Runtime ─────────────────────────────────┐
│ ▸ Local (Ollama)           ollama:llama3.1:8b    │
│   Ozwell                   gpt-4.1-mini          │
│   BYO-Cloud                Select provider...    │
└──────────────────────────────────────────────────┘
```

### Navigation

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate options |
| `Enter` or `→` | Select / drill into |
| `Esc` or `←` | Go back / cancel |

### Features

- **Live model lists**: Fetches available models from Ollama, Ozwell, OpenAI, and Anthropic APIs
- **Curated recommendations**: Ozwell shows recommended models first, with "Other models" collapsed
- **Last model memory**: Remembers your last-used model per runtime
- **Setup flow**: If a provider isn't configured, selecting it prompts for your API key

## Credentials Vault

API keys are stored securely in `~/.config/jerry-term/config.json`:

```json
{
  "runtime": "ozwell",
  "model": "gpt-4.1-mini",
  "credentials": {
    "ozwell": { "apiKey": "ozw_..." },
    "byo": {
      "openai": { "apiKey": "sk-..." },
      "anthropic": { "apiKey": "sk-ant-..." }
    }
  },
  "lastModel": {
    "local": "ollama:llama3.1:8b",
    "ozwell": "gpt-4.1-mini",
    "byo.openai": "gpt-4o"
  }
}
```

### Masked Keys

API keys are always displayed in masked format (`sk-pr****abcd`) in:
- `/config` output
- Runtime picker
- Status bar

### Managing Keys

```bash
# Set a key (routes to active runtime's credential slot)
> /config apiKey sk-...

# Clear specific keys
> /config clearKey openai
> /config clearKey anthropic
> /config clearKey ozwell

# Clear the active runtime's key
> /config apiKey clear
```

**Note**: Clearing the key for your active provider automatically switches you to local runtime to prevent errors.

## Commands Reference

| Command | Aliases | Description |
|---------|---------|-------------|
| `/runtime [kind]` | `/rt` | Open runtime picker or switch runtime |
| `/model [id]` | `/m` | Open model picker or set model |
| `/config [key] [value]` | `/cfg` | View or update configuration |
| `/health` | `/hc` | Run system health checks |
| `/aw-tail [limit]` | `/aw` | Peek ActivityWatch events |
| `/help [command]` | `/h`, `/?` | Show help |
| `/exit` | `/q` | Exit |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Submit input |
| `↑` / `↓` | Navigate command history |
| `Ctrl+T` | Toggle Tools panel |
| `Ctrl+K` | Toggle Thinking panel |
| `Ctrl+E` | Expand/collapse tool outputs |
| `Ctrl+L` | Clear transcript |
| `Ctrl+C` | Cancel turn or exit |

## CLI Reference

```
jerry-term [options] [message]

Options:
  -v, --version          Show version
  -h, --help             Show help
  -r, --runtime <kind>   Set initial runtime (local|ozwell|byo-cloud|anthropic)
  --model <id>           Set initial model
  -H, --health           Run health diagnostics and exit
  --verbose              Enable debug output
  --no-ui                Use basic REPL instead of OpenTUI
  --config <path>        Custom config file path
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `JERRY_RUNTIME` | Default runtime |
| `JERRY_MODEL` | Default model |
| `JERRY_TERM_CONFIG` | Custom config file path |
| `OZWELL_API_KEY` | Ozwell API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `OPENAI_API_KEY` | OpenAI API key |

## Troubleshooting

### "Ollama not running"

```bash
ollama serve
curl http://127.0.0.1:11434/api/tags
```

### UI rendering issues

- Use **Bun** for the OpenTUI interface (not Node.js)
- Try a modern terminal: Kitty, Ghostty, WezTerm, Alacritty, iTerm2
- Use `--no-ui` for basic readline REPL

### API key errors

1. Check your key is set: `/config`
2. Verify with the provider's API directly
3. Try clearing and re-entering: `/config clearKey openai`

## Known Issues

- **Sticky TUI / transcript scroll**: The fullscreen UI may conflict with terminal scrollback. Use `PgUp`/`PgDown` to scroll, or `--no-ui` for a reliable non-fullscreen experience.

## See Also

- [README](../packages/jerry-term/README.md) — Full reference documentation
- [Phase 3 Plan](./plans/phase-3.md) — Development roadmap
