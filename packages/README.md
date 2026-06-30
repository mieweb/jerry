# Jerry Packages

This folder contains the Jerry monorepo packages. See [plan.md §6](../plan.md) for the full architecture.

| Folder | Package | Phase | Role |
|--------|---------|-------|------|
| `jerry-app/` | `@mieweb/jerry-app` | 1 | Worker: fetch/queue/scheduled + AgentSession DO + agent definition |
| `tools/` | `@mieweb/jerry-tools` | 0 | AW aggregation + footnote + file tools |
| `collector/` | `@mieweb/jerry-collector` | 1 | Local sidecar: folder/screenshot watch + AW poll → push events |
| `cli/` | `@mieweb/jerry-cli` | 1 | Message-first CLI; thin bin over @mieweb/cloud-agent-cli |

Platform dependencies (`@mieweb/cloud`, `@mieweb/footnote`, etc.) live in `vendor/` as git submodules, not here.
