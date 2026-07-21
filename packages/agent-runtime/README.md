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

## Usage

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

Use your own OpenAI-compatible endpoint:

```ts
import { resolveRuntime, mergeProfile } from "@mieweb/jerry-agent-runtime";

const runtime = resolveRuntime(mergeProfile({
  runtime: "byo-cloud",
  model: "https://api.openai.com/v1#gpt-4o",
  apiKey: process.env.OPENAI_API_KEY,
}));
```

Environment variables: `JERRY_API_KEY` or `OPENAI_API_KEY`.

### ozwell

Use Ozwell Manager for model inference:

```ts
import { resolveRuntime, mergeProfile } from "@mieweb/jerry-agent-runtime";

const runtime = resolveRuntime(mergeProfile({
  runtime: "ozwell",
  model: "gpt-4.1-mini",
  apiKey: process.env.OZWELL_API_KEY, // ozw_ or agnt_key-
  // endpoint defaults to https://ozwellapi.os.mieweb.org
}));
```

Environment variables: `OZWELL_AGENT_KEY` (preferred) or `OZWELL_API_KEY`.

If Ozwell is unavailable (network/auth error), the runtime automatically falls back to local Ollama with a warning message.

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

For cloud runtimes (`byo-cloud` / `ozwell`), egress is automatically normalized to `allow-model` if left at `deny`.

See [plan.md §4](../../plan.md) for the full trust and data-path control design.

## Environment Variables

| Variable | Runtime | Description |
|----------|---------|-------------|
| `JERRY_RUNTIME` | all | Override runtime: `local`, `byo-cloud`, `ozwell` |
| `JERRY_MODEL` | all | Override model reference |
| `JERRY_EGRESS` | all | Override egress policy: `deny`, `allow-model`, `allow-tools` |
| `JERRY_API_KEY` | byo-cloud | API key for custom endpoint |
| `OPENAI_API_KEY` | byo-cloud | Fallback API key (OpenAI convention) |
| `OZWELL_API_KEY` | ozwell | Parent API key (`ozw_` prefix) |
| `OZWELL_AGENT_KEY` | ozwell | Agent key (`agnt_key-` prefix, preferred) |
| `OZWELL_ENDPOINT` | ozwell | Custom Ozwell endpoint (default: Manager host) |
