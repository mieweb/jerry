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
| `local` | ✅ | Vercel AI SDK over local Ollama (OpenAI-compatible) |
| `byo-cloud` | ✅ | Same AI SDK loop, user's OpenAI-compatible endpoint with API key |
| `ozwell` | ✅ | AI SDK over Ozwell Manager endpoint with local Ollama fallback |

## CLI commands (from Jerry repo root)

Worker must be running (`pnpm dev`). Helper:

```bash
alias jerry='NODE_OPTIONS="--import tsx" node packages/cli/bin/jerry.js'
```

### Local (default)

```bash
JERRY_RUNTIME=local \
  JERRY_MODEL=ollama:qwen2.5:3b \
  jerry "summarize my work from July 13th"
```

Default model when unset: `ollama:qwen2.5` (`DEFAULT_PRIVACY_PROFILE` in `src/profile.ts`).

### Ozwell

```bash
unset OZWELL_AGENT_KEY   # avoid agnt_key overriding parent key

JERRY_RUNTIME=ozwell \
  JERRY_MODEL=gpt-4.1-mini \
  OZWELL_API_KEY=ozw_your_key \
  jerry "summarize my work from July 13th"
```

- Prefer **`ozw_` parent keys**. `agnt_key-` binds Ozwell-side persona/tools and often ignores Jerry tools.
- Default endpoint: `https://ozwellapi.os.mieweb.org` (`DEFAULT_OZWELL_ENDPOINT`).
- On auth/network failure: `[jerry] Ozwell unavailable…` then local Ollama fallback.

```bash
JERRY_RUNTIME=ozwell OZWELL_API_KEY=ozw_bad jerry "hello"
```

### BYO-cloud

```bash
JERRY_RUNTIME=byo-cloud \
  JERRY_MODEL='https://api.openai.com/v1#gpt-4o' \
  OPENAI_API_KEY=sk-... \
  jerry "summarize my work from July 13th"
```

Model must be URL-style (`https://…#modelId`), not `ollama:…`.

## Programmatic usage

### Local (default)

```ts
import { resolveRuntime, DEFAULT_PRIVACY_PROFILE } from "@mieweb/jerry-agent-runtime";

const runtime = resolveRuntime(DEFAULT_PRIVACY_PROFILE);

for await (const event of runtime.runTurn({ messages: [{ role: "user", content: "Hello" }] })) {
  if (event.type === "text-delta") {
    process.stdout.write(event.text);
  }
}
```

### byo-cloud

```ts
import { resolveRuntime, mergeProfile } from "@mieweb/jerry-agent-runtime";

const runtime = resolveRuntime(mergeProfile({
  runtime: "byo-cloud",
  model: "https://api.openai.com/v1#gpt-4o",
  apiKey: process.env.OPENAI_API_KEY,
}));
```

### ozwell

```ts
import { resolveRuntime, mergeProfile } from "@mieweb/jerry-agent-runtime";

const runtime = resolveRuntime(mergeProfile({
  runtime: "ozwell",
  model: "gpt-4.1-mini",
  apiKey: process.env.OZWELL_API_KEY, // prefer ozw_
  // endpoint defaults to https://ozwellapi.os.mieweb.org
}));
```

## Privacy profiles

The default profile runs fully local with no network egress:

```ts
{
  runtime: "local",
  model: "ollama:qwen2.5",
  egress: "deny",
  tools: { /* see DEFAULT_PRIVACY_PROFILE */ }
}
```

For cloud runtimes (`byo-cloud` / `ozwell`), egress is automatically normalized to `allow-model` if left at `deny`.

### Integration tools (Drive, YouTube)

Integration tools (`read_drive`, `post_youtube`, `fetch_youtube`) require `egress: "allow-tools"` to be available. Under `deny` or `allow-model`, these tools are filtered out at turn start. With `allow-tools`, they pass through but require call-time approval (`"ask"` disposition).

See [plan.md §4](../../plan.md) for the full trust and data-path control design.

## Environment Variables

| Variable | Runtime | Description |
|----------|---------|-------------|
| `JERRY_RUNTIME` | all | Override runtime: `local`, `byo-cloud`, `ozwell` |
| `JERRY_MODEL` | all | Override model reference |
| `JERRY_EGRESS` | all | Override egress policy: `deny`, `allow-model`, `allow-tools` |
| `JERRY_API_KEY` | byo-cloud | API key for custom endpoint |
| `OPENAI_API_KEY` | byo-cloud | Fallback API key (OpenAI convention) |
| `OZWELL_API_KEY` | ozwell | Parent API key (`ozw_` prefix) — **preferred for Jerry** |
| `OZWELL_AGENT_KEY` | ozwell | Agent key (`agnt_key-`); conflicts with Jerry local tools |
| `OZWELL_ENDPOINT` / `JERRY_ENDPOINT` | ozwell | Custom Ozwell endpoint (default: Manager host) |
