# Agent runtime port preparation
_Exported on 6/30/2026 at 17:12:19 EDT from Cursor (3.9.16)_

---

**User**

Prepare for @docs/plans/phase-0.md:30-41  agent runtime port 

---

**Cursor**

Researching the codebase and phase-0 docs to draft a plan for the agent-runtime-port work.


Reading plan.md sections and existing package patterns for concrete implementation details.


Checking whether the repo documents package naming conventions and any existing AI SDK version pins in vendor submodules.


Creating the implementation plan from the architecture docs and codebase state.


---

**User**

Implement the plan as specified, it is attached for your reference. Do NOT edit the plan file itself.

To-do's from the plan have already been created. Do not create them again. Mark them as in_progress as you work, starting with the first one. Don't stop until you have completed all the to-dos.

---

**Cursor**

All tasks completed. Here's a summary of what was implemented:

## Summary

Created `@mieweb/jerry-agent-runtime` package implementing the L1 `AgentRuntime` port:

**Package structure:**
```
packages/agent-runtime/
├── package.json          # deps: ai, @ai-sdk/openai-compatible, zod
├── tsconfig.json
├── README.md
└── src/
    ├── index.ts          # public exports
    ├── types.ts          # AgentRuntime, TurnInput, RuntimeEvent, PrivacyProfile
    ├── profile.ts        # DEFAULT_PRIVACY_PROFILE, parseModelRef, mergeProfile
    ├── resolve-runtime.ts
    ├── backends/local.ts # createLocalRuntime + filterTools
    ├── stream/map-events.ts
    └── *.test.ts         # 49 passing tests
```

**Key exports:**
- `AgentRuntime` interface with `runTurn(input): AsyncIterable<RuntimeEvent>`
- `PrivacyProfile` type with `runtime`, `model`, `egress`, and `tools` fields
- `DEFAULT_PRIVACY_PROFILE` (local + `ollama:qwen2.5` + `egress: deny`)
- `resolveRuntime(profile)` factory (returns local runtime; throws for byo-cloud/ozwell)
- `parseModelRef()` for `ollama:model` and `https://url#model` formats
- `mergeProfile()` for creating profiles with partial overrides

**Test coverage:**
- Profile parsing and merging
- Runtime resolution (local works, others throw)
- Tool filtering by egress policy
- Stream event mapping
- MockLanguageModelV1 integration tests
- Optional Ollama integration test (`JERRY_OLLAMA_TEST=1`)

CI passes: typecheck, lint, and 49 unit tests all green.

