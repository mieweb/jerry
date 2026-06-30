# @mieweb/jerry-agent-runtime

L1 agent runtime port for Jerry. Provides the `AgentRuntime` interface, privacy profile types, and pluggable backends.

## Overview

This package implements the "thin port" layer (L1) from [plan.md §3/§5](../../plan.md):

- **`AgentRuntime`** interface — `runTurn(input)` returns an async iterable of `RuntimeEvent`s
- **Privacy profiles** — configure runtime, model, and egress boundaries
- **`resolveRuntime(profile)`** — factory that returns the appropriate backend

## Backends

| Runtime | Status | Description |
|---------|--------|-------------|
| `local` | ✅ Phase 0 | Vercel AI SDK over local Ollama (OpenAI-compatible) |
| `byo-cloud` | 🔜 Phase 1+ | Same loop, user's OpenAI-compatible endpoint |
| `ozwell` | 🔜 Phase 1+ | Managed path via Ozwell agent system |

## Usage

```ts
import { resolveRuntime, DEFAULT_PRIVACY_PROFILE } from "@mieweb/jerry-agent-runtime";

const runtime = resolveRuntime(DEFAULT_PRIVACY_PROFILE);

for await (const event of runtime.runTurn({ messages: [{ role: "user", content: "Hello" }] })) {
  if (event.type === "text-delta") {
    process.stdout.write(event.text);
  }
}
```

## Privacy profiles

The default profile runs fully local with no network egress:

```ts
{
  runtime: "local",
  model: "ollama:qwen2.5",
  egress: "deny",
  tools: { aw: "local", footnote: "local", drive: "ask", youtube: "ask" }
}
```

See [plan.md §4](../../plan.md) for the full trust and data-path control design.
