# @mieweb/jerry-cli

Message-first CLI for Jerry. The binary name is `jerry`; agent identity is determined by `basename(argv[0])` (busybox/git multicall pattern).

This is a thin wrapper over `@mieweb/cloud-agent-cli` that configures the Jerry agent target, plus an interactive session mode.

See [plan.md §8](../../plan.md) for CLI contract details.

## One-shot (scripting)

```bash
jerry summarize my last 2 hours
jerry -txt quick note for the day
jerry --session session-1754239-a9f2 what did I ship?
```

After the reply, one-shot prints a `tools:` line when Jerry called any tools
(same audit trail as the REPL). It is omitted when the turn used none.

Arguments are joined with spaces, so quotes are only needed to preserve
multiple spaces or escape shell metacharacters.

## Interactive session

A greeting (or no arguments at all) opens a persistent conversation instead of
sending a single message:

```bash
jerry            # opens a conversation
jerry hello      # same; also hi / hey / yo, with or without "jerry"
```

A greeting only counts when the whole message is a greeting —
`jerry hi jerry summarize my day` still runs as a one-shot task.

On start you get the resolved `runtime`, `model`, and `egress`, the session ID,
and the command to resume later. Each turn shows a transient `…working…`
indicator while Jerry works, then the answer, then the tools Jerry actually
called:

```
jerry › summarize my last 2 hours and pull anything related from notes
  Between 10:00 and 12:00 you spent ~1h20m in VS Code on packages/cli …
  tools: summarize_activity · search_memory
  sources: ActivityWatch · local notes
```

The `tools:` line is the auditable record of what Jerry looked at. It is
omitted entirely when a turn needed no tools.

### Keys

| Key | Effect |
| --- | --- |
| `q`, `quit`, `exit` | End the session |
| `Ctrl+C` | End the session (again, mid-turn, to leave immediately) |
| `Ctrl+D` | End the session (EOF) |

Every exit prints the resume command.

### Slash-commands

| Command | Effect |
| --- | --- |
| `/help` | List commands and exit keys |
| `/session` | Current session ID and resume command |
| `/new` | Start a fresh session without leaving the REPL |
| `/runtime [name]` | List runtimes, or switch to one |
| `/model [name]` | List this runtime's models, or switch to one |
| `/sources` | Which sources of truth are wired up |
| `/dryrun <task>` | Show what would run, without sending |

### Changing runtime and model

`/runtime` and `/model` with no argument list what is available, mark what is
in use with `•`, and name any key that is missing:

```
jerry › /runtime
  runtime  local   egress  deny

  available runtimes
    • local       Ollama on this machine, nothing leaves
      byo-cloud   needs ANTHROPIC_API_KEY or OPENAI_API_KEY
      ozwell      needs OZWELL_API_KEY

  switch with /runtime <name>
```

Pass a name to switch. `/runtime <name>` also lands on that runtime's first
usable model, so you never end up on a model the runtime cannot call:

```
jerry › /runtime byo-cloud
  Now using Claude Sonnet 5
  runtime  byo-cloud   model  claude-sonnet-5   egress  allow-model
```

Models are scoped to the runtime in use, since that is what `/model` can reach
without also changing the runtime:

```
jerry › /model
  model  https://api.anthropic.com/v1#claude-sonnet-5

  available in byo-cloud
    • claude-sonnet-5   Claude Sonnet 5
      claude-opus-5     Claude Opus 5
      claude-opus-4-8   Claude Opus 4.8
      claude-opus-4-5   Claude Opus 4.5
      gpt-5.6-sol       needs OPENAI_API_KEY

  switch with /model <name>
  or https://host/v1#<model> for another endpoint
```

Short forms work too — `sonnet`, `opus`, `fable`, `sol`, `terra`, `luna`,
`llama`, `qwen`. Naming a model from another runtime says where it lives rather
than switching silently:

```
jerry › /model gpt-5.6-sol
  gpt-5.6-sol isn't available in the local runtime.
  It lives in byo-cloud — /runtime byo-cloud first.
```

Keys are checked before the switch, so a missing one is a message rather than a
failed turn:

```
jerry › /model gpt-5.6-sol
  OPENAI_API_KEY isn't set, so I can't use GPT-5.6 Sol.
  export OPENAI_API_KEY=your-key-here
  Check the API keys and try again. Staying on claude-sonnet-5.
```

The catalog is not a ceiling: `ollama:<name>` reaches any model you have
pulled, and `https://host/v1#<model>` reaches any OpenAI-compatible endpoint.

Changes last for the session only; nothing is written to disk. The key is
forwarded with each request, so it works even when the worker was started
without it in scope. Returning to a local model drops the key and restores the
stricter egress policy.

### Resuming

Sessions are persisted server-side, so you can pick a conversation back up:

```bash
jerry --session session-1754239-a9f2
```

`--session <id>` with a message stays one-shot; alone, it resumes in the REPL.
`JERRY_SESSION` is honored for a bare `jerry`.

## Environment

| Variable | Effect |
| --- | --- |
| `JERRY_URL` | Override base URL (default `http://127.0.0.1:8787`) |
| `JERRY_SESSION` | Session ID to use |
| `NO_COLOR` | Disable ANSI styling |
| `ANTHROPIC_API_KEY` | Key for Claude models |
| `OPENAI_API_KEY` | Key for GPT models |
| `OZWELL_API_KEY` | Key for the Ozwell runtime |
| `JERRY_API_KEY` | Generic fallback for any cloud runtime |

Copy [`.env.example`](../../.env.example) to `.env` in the repo root; the CLI loads it automatically.
