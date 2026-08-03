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
| `/runtime`, `/model` | Show the resolved values |
| `/sources` | Which sources of truth are wired up |
| `/dryrun <task>` | Show what would run, without sending |

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
