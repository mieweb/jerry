# @mieweb/jerry-cli

Message-first CLI for Jerry. The binary name is `jerry`; agent identity is determined by `basename(argv[0])` (busybox/git multicall pattern).

This is a thin wrapper over `@mieweb/cloud-agent-cli` that configures the Jerry agent target, loads repo `.env`, and adds `--approve` for one-shot Drive/YouTube ask approval. `--approve` auto-approves `waiting_for_approval` suspensions (looping up to 5 times for chained ask tools) without printing the intermediate "Reply to approve" prompt, so the command completes in a single invocation.

```bash
jerry --approve what files did I share today
jerry --approve upload ./clip.mp4 to youtube with title "Demo"
jerry --approve get the transcript for youtube video dQw4w9WgXcQ
```

See [plan.md §8](../../plan.md) and [docs/manual.md §19](../../docs/manual.md#19-phase-2-slice-5--external-integrations-drive--youtube).
