# Jerry CLI architectural plan
_Exported on 7/22/2026 at 06:02:55 EDT from Cursor (3.12.17)_

---

**User**

Role & Persona:
Act as a Senior Software Engineer and System Architect specializing in Node.js/TypeScript ecosystem CLI development (npm/bun). You are an expert in designing loosely coupled, highly observable terminal interfaces for complex AI agent systems.

Context & Goal:
We are building a standalone, interactive CLI application called jerry-term (or jerry-cli). This CLI will serve as a user-friendly wrapper around our existing, host-agnostic "Jerry" system. The goal is to allow users to easily install, configure, and test Jerry's capabilities directly from their terminal, taking inspiration from the opencode.ai CLI.

Architectural Constraints:

Strict Isolation: The development of the core Jerry system is ongoing. The CLI must be developed in complete isolation (e.g., in a separate directory like dev-jerry-terminal or a separate branch/PR).

Decoupling: The CLI must consume Jerry purely as an external or linked dependency (acting as the interface for jerry-lib and its runtimes) without requiring changes to the core engine. It must gracefully adapt to future updates in the core system.

Package Management: The CLI should be installable via npm install -g jerry-term and be fully compatible with Bun.

Core CLI Features Required:

Runtime Configuration: A command (e.g., /runtime) allowing users to dynamically switch between our supported backend environments: local, ozwell, and byo-cloud.

System Observability: The terminal must output real-time visibility into Jerry's internal processes, active tool usage, and "thinking" steps during execution.

Sanity & Health Checks: A built-in diagnostic tool to verify the environment. It must check the connection and status of:

Local Ollama instances

ActivityWatch background processes

Footnote services

Jerry MCP tools

Task Request:

Architectural Plan: Discuss how we should structure this isolated CLI project. How do we cleanly bridge the CLI commands to the core Jerry system?

Risk Assessment: Identify potential architectural concerns, edge cases, or issues with this separation (e.g., dependency management, state handling).

Preparation: Detail the exact technical preparations, folder structures, and boilerplate setup required to start building this right now.

---

**Cursor**

I'll analyze your existing Jerry system structure first to understand the current architecture, then provide a comprehensive architectural plan for the isolated CLI.

Let me check the footnote integration and see the existing scripts for context.

Now I have a comprehensive understanding of your Jerry system. Let me provide a detailed architectural plan for the isolated `jerry-term` CLI.

---

## Architectural Plan for `jerry-term` CLI

### 1. Isolation Strategy

Based on your constraints, I recommend a **sibling directory approach** with npm link during development:

```
jerry-master/
├── jerry/                 # Existing monorepo (untouched)
│   ├── packages/
│   │   ├── agent-runtime/ # @mieweb/jerry-agent-runtime
│   │   ├── cli/           # @mieweb/jerry-cli (existing thin wrapper)
│   │   ├── tools/         # @mieweb/jerry-tools
│   │   └── ...
│   └── vendor/
│       └── cloud/packages/cloud-agent-cli/
└── jerry-term/            # NEW isolated CLI project
    ├── package.json
    ├── src/
    │   ├── index.ts       # Entry point
    │   ├── repl/          # Interactive REPL loop
    │   ├── commands/      # Slash command handlers
    │   ├── ui/            # Terminal UI components (ink/blessed)
    │   ├── health/        # Health check adapters
    │   └── bridge/        # Jerry system bridge layer
    └── bin/
        └── jerry-term.js
```

**Why this approach?**
- Complete filesystem isolation from core Jerry
- Can be developed on a separate branch or even separate repo
- Consumes Jerry packages via `workspace:*` or npm link during dev
- Publishes independently to npm

### 2. Bridge Architecture

The CLI bridges to Jerry through a **facade pattern** that abstracts the underlying complexity:

```
┌─────────────────────────────────────────────────────────────────┐
│                         jerry-term CLI                          │
├─────────────────────────────────────────────────────────────────┤
│  REPL Layer                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ /runtime │ │ /health  │ │ /config  │ │ /history │ ... │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘           │
│       │            │            │            │                  │
├───────┴────────────┴────────────┴────────────┴──────────────────┤
│  Bridge Layer (src/bridge/)                                     │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ JerryBridge                                                 ││
│  │  - resolveRuntime(profile) → AgentRuntime                   ││
│  │  - runTurn(input) → AsyncIterable<RuntimeEvent>             ││
│  │  - getProfile() → PrivacyProfile                            ││
│  │  - switchRuntime(kind) → void                               ││
│  └─────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│  Health Adapters (src/health/)                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │  Ollama  │ │   AW     │ │ Footnote │ │ MCP Tools│           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │  External Deps    │
                    ├───────────────────┤
                    │ @mieweb/jerry-    │
                    │   agent-runtime   │
                    │ @mieweb/jerry-    │
                    │   tools           │
                    └───────────────────┘
```

### 3. Core Module Design

```typescript
// src/bridge/jerry-bridge.ts
import type { AgentRuntime, PrivacyProfile, RuntimeEvent, TurnInput } from "@mieweb/jerry-agent-runtime";
import { resolveRuntime, DEFAULT_PRIVACY_PROFILE, mergeProfile } from "@mieweb/jerry-agent-runtime";

export class JerryBridge {
  private runtime: AgentRuntime;
  private profile: PrivacyProfile;

  constructor(initialProfile?: Partial<PrivacyProfile>) {
    this.profile = mergeProfile(DEFAULT_PRIVACY_PROFILE, initialProfile ?? {});
    this.runtime = resolveRuntime(this.profile);
  }

  /** Switch runtime backend dynamically */
  switchRuntime(kind: "local" | "byo-cloud" | "ozwell", options?: Partial<PrivacyProfile>): void {
    this.profile = mergeProfile(this.profile, { runtime: kind, ...options });
    this.runtime = resolveRuntime(this.profile);
  }

  /** Execute a turn and yield observable events */
  async *runTurn(input: TurnInput): AsyncIterable<RuntimeEvent> {
    yield* this.runtime.runTurn(input);
  }

  getProfile(): PrivacyProfile { return this.profile; }
  getRuntime(): AgentRuntime { return this.runtime; }
}
```

### 4. Observability UI System

For real-time visibility, I recommend **Ink** (React for CLI) with a panel layout:

```
┌─────────────────────────────────────────────────────────────────┐
│ jerry-term v0.1.0                    [local] ollama:qwen2.5:3b  │
├─────────────────────────────────────────────────────────────────┤
│ 🤔 Thinking...                                                  │
│ ├─ Analyzing user request                                       │
│ └─ Planning tool sequence                                       │
├─────────────────────────────────────────────────────────────────┤
│ 🔧 Tools                                                        │
│ ├─ ✓ aw_get_activity (2.3s)                                    │
│ │   └─ Found 47 events in last 2 hours                         │
│ └─ ⏳ footnote_search "architecture notes"                      │
├─────────────────────────────────────────────────────────────────┤
│ 💬 Response                                                     │
│ Based on your ActivityWatch data, you spent most of your time  │
│ in VS Code working on the jerry-term project...                │
├─────────────────────────────────────────────────────────────────┤
│ > _                                                             │
└─────────────────────────────────────────────────────────────────┘
```

### 5. Command System

```typescript
// src/commands/types.ts
export interface CommandContext {
  bridge: JerryBridge;
  ui: UIController;
  config: TermConfig;
}

export interface Command {
  name: string;
  aliases?: string[];
  description: string;
  execute(args: string[], ctx: CommandContext): Promise<void>;
}

// src/commands/runtime.ts
export const runtimeCommand: Command = {
  name: "runtime",
  aliases: ["rt"],
  description: "Switch runtime backend: /runtime local|ozwell|byo-cloud",
  async execute(args, ctx) {
    const [kind] = args;
    if (!["local", "byo-cloud", "ozwell"].includes(kind)) {
      ctx.ui.error("Usage: /runtime <local|byo-cloud|ozwell>");
      return;
    }
    ctx.bridge.switchRuntime(kind as RuntimeKind);
    ctx.ui.success(`Switched to ${kind} runtime`);
  },
};
```

### 6. Health Check System

```typescript
// src/health/types.ts
export interface HealthCheck {
  name: string;
  description: string;
  check(): Promise<HealthResult>;
}

export interface HealthResult {
  status: "ok" | "warn" | "error";
  message: string;
  details?: Record<string, unknown>;
  latencyMs?: number;
}

// src/health/ollama.ts
export const ollamaHealthCheck: HealthCheck = {
  name: "Ollama",
  description: "Local LLM inference server",
  async check() {
    const start = Date.now();
    try {
      const res = await fetch("http://127.0.0.1:11434/api/tags");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return {
        status: "ok",
        message: `${data.models?.length ?? 0} models available`,
        latencyMs: Date.now() - start,
        details: { models: data.models?.map((m: any) => m.name) },
      };
    } catch (e) {
      return { status: "error", message: `Not reachable: ${e}` };
    }
  },
};

// src/health/activity-watch.ts
export const awHealthCheck: HealthCheck = {
  name: "ActivityWatch",
  description: "Background activity monitoring",
  async check() {
    try {
      const res = await fetch("http://127.0.0.1:5600/api/0/info");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const info = await res.json();
      return {
        status: "ok",
        message: `v${info.version} - ${info.hostname}`,
        details: info,
      };
    } catch {
      return { status: "error", message: "Not running" };
    }
  },
};
```

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Dependency version drift** | High | Pin exact versions of `@mieweb/*` packages; use peerDependencies for flexibility |
| **Breaking API changes in agent-runtime** | High | Bridge layer absorbs changes; define adapter interface |
| **State synchronization** | Medium | Bridge owns all state; CLI is stateless view layer |
| **MCP server lifecycle** | Medium | Health checks detect; `/restart` command for recovery |
| **Bun compatibility issues** | Low | Avoid Node-specific APIs; test with both runtimes |
| **Terminal rendering inconsistencies** | Low | Use Ink with fallback to basic output mode |
| **Ollama model availability** | Medium | Health check warns; graceful degradation to ozwell |

### Critical Edge Cases

1. **Runtime switch during active turn**: Queue the switch until turn completes
2. **Network timeout during ozwell calls**: Implement circuit breaker pattern
3. **Large tool outputs**: Truncate with "expand" option
4. **MCP server crash**: Auto-reconnect with exponential backoff
5. **Config file corruption**: Validate on load; fallback to defaults

---

## Preparation: Exact Technical Setup

### Step 1: Create Project Structure

```bash
# From jerry-master directory (parent of jerry/)
mkdir jerry-term && cd jerry-term

# Initialize with npm (bun-compatible)
npm init -y
```

### Step 2: Package.json Configuration

```json
{
  "name": "jerry-term",
  "version": "0.1.0",
  "description": "Interactive terminal interface for Jerry AI agent",
  "type": "module",
  "license": "MIT",
  "bin": {
    "jerry-term": "./bin/jerry-term.js"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "bin"],
  "scripts": {
    "dev": "tsx src/index.ts",
    "build": "tsup src/index.ts --format esm --dts",
    "typecheck": "tsc --noEmit",
    "test": "node --import tsx --test src/**/*.test.ts",
    "prepublishOnly": "npm run build"
  },
  "engines": {
    "node": ">=22.0.0"
  },
  "dependencies": {
    "@mieweb/jerry-agent-runtime": "workspace:*",
    "@mieweb/jerry-tools": "workspace:*",
    "ink": "^5.0.1",
    "ink-spinner": "^5.0.0",
    "react": "^18.3.1",
    "zod": "^3.23.0",
    "conf": "^13.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "tsup": "^8.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  },
  "peerDependencies": {
    "@mieweb/jerry-agent-runtime": ">=0.0.0",
    "@mieweb/jerry-tools": ">=0.0.0"
  },
  "peerDependenciesMeta": {
    "@mieweb/jerry-agent-runtime": { "optional": true },
    "@mieweb/jerry-tools": { "optional": true }
  }
}
```

### Step 3: Directory Structure

```
jerry-term/
├── bin/
│   └── jerry-term.js           # CLI entry point
├── src/
│   ├── index.ts                # Main export
│   ├── cli.tsx                 # Ink app root
│   ├── bridge/
│   │   ├── index.ts
│   │   ├── jerry-bridge.ts     # Core bridge to Jerry
│   │   └── event-emitter.ts    # Observable event bus
│   ├── commands/
│   │   ├── index.ts            # Command registry
│   │   ├── types.ts
│   │   ├── runtime.ts          # /runtime command
│   │   ├── health.ts           # /health command
│   │   ├── config.ts           # /config command
│   │   └── help.ts             # /help command
│   ├── health/
│   │   ├── index.ts            # Health check runner
│   │   ├── types.ts
│   │   ├── ollama.ts
│   │   ├── activity-watch.ts
│   │   ├── footnote.ts
│   │   └── mcp-tools.ts
│   ├── ui/
│   │   ├── index.ts
│   │   ├── App.tsx             # Main Ink app
│   │   ├── Header.tsx          # Status bar
│   │   ├── ThinkingPanel.tsx   # Thinking visualization
│   │   ├── ToolPanel.tsx       # Tool execution display
│   │   ├── ResponsePanel.tsx   # Streamed response
│   │   └── InputPrompt.tsx     # User input
│   ├── config/
│   │   ├── index.ts
│   │   ├── schema.ts           # Zod config schema
│   │   └── loader.ts           # Config file handling
│   └── utils/
│       ├── logger.ts
│       └── format.ts
├── tsconfig.json
├── tsup.config.ts
└── README.md
```

### Step 4: TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### Step 5: Entry Point

```javascript
#!/usr/bin/env node
// bin/jerry-term.js
import { main } from '../dist/index.js';
main(process.argv.slice(2));
```

### Step 6: Link for Development

```bash
# In jerry/ monorepo, add jerry-term to workspace
# Edit pnpm-workspace.yaml:
#   packages:
#     - "../jerry-term"

# Or use npm link:
cd jerry-term
npm link
cd ../jerry
npm link jerry-term
```

---

## Recommended Development Order

1. **Phase 1**: Bridge layer + basic REPL (no UI)
2. **Phase 2**: Health check system
3. **Phase 3**: Ink UI with observability panels
4. **Phase 4**: Command system (`/runtime`, `/health`, `/config`)
5. **Phase 5**: Polish, tests, npm publish

Would you like me to create the initial boilerplate files to get started immediately?

---

**User**

jerry-master and jerry (github) repo under it is my own personal local setup, jerry-master directory is not on github. 
How do you propose we should proceed with the branching and updation of directories on github given that main is still untouched only the initial plan and some other markdown was only pushed to it, and after that all the updates we've been making have been made on devlopment branch? 

---

**Cursor**

Good clarification. Let me understand your current Git state and propose a branching strategy.

Now I see your workflow. Here's my recommendation:

---

## Proposed Branching Strategy

### Current State
```
main (4 commits)
  └── development (active, 9+ merged PRs)
        ├── phase2/runtime-backends (merged)
        ├── phase2/mcp-expose (merged)
        └── ... other feature branches
```

### Recommended Approach: **Same Repo, New Package, Feature Branch**

```
development
  └── phase3/jerry-term  ← NEW feature branch
        └── packages/jerry-term/  ← NEW package in monorepo
```

**Why this approach?**

| Factor | Same Repo + Feature Branch | Separate Repo |
|--------|---------------------------|---------------|
| **Dependency management** | Easy (`workspace:*`) | Complex (git deps or publish first) |
| **Development velocity** | Fast iteration | Slow (publish → install cycle) |
| **Isolation** | Branch-level isolation | Full isolation |
| **CI integration** | Uses existing CI | Needs new CI setup |
| **Future extraction** | Easy to extract later | Already separate |

The "strict isolation" requirement is satisfied because:
1. **Branch isolation**: `phase3/jerry-term` doesn't affect `development` until PR
2. **Package isolation**: `packages/jerry-term/` is self-contained with its own `package.json`
3. **Dependency direction**: jerry-term imports from agent-runtime, never the reverse

---

## Implementation Plan

### Step 1: Create Feature Branch

```bash
# From development branch
git checkout development
git pull origin development
git checkout -b phase3/jerry-term
```

### Step 2: Add Package to Workspace

The new package goes in `packages/jerry-term/`:

```
jerry/
├── packages/
│   ├── agent-runtime/    # Consumed by jerry-term
│   ├── tools/            # Consumed by jerry-term
│   ├── cli/              # Existing thin CLI (untouched)
│   ├── jerry-app/        # Server (untouched)
│   ├── collector/        # (untouched)
│   └── jerry-term/       # NEW: Interactive CLI
│       ├── package.json
│       ├── src/
│       └── bin/
└── pnpm-workspace.yaml   # Already includes packages/*
```

The existing `pnpm-workspace.yaml` already has `packages/*`, so it will automatically pick up the new package.

### Step 3: Package Dependencies

```json
{
  "name": "@mieweb/jerry-term",
  "version": "0.1.0",
  "private": false,
  "dependencies": {
    "@mieweb/jerry-agent-runtime": "workspace:*",
    "@mieweb/jerry-tools": "workspace:*"
  }
}
```

During development: `workspace:*` links to local packages
When publishing: Replace with `^0.1.0` or semver ranges

### Step 4: Development Workflow

```bash
# Work on jerry-term in isolation
git checkout phase3/jerry-term

# Make changes, commit
git add packages/jerry-term/
git commit -m "feat(jerry-term): add REPL and health checks"

# Push feature branch
git push -u origin phase3/jerry-term

# When ready, PR into development
# GitHub: phase3/jerry-term → development
```

### Step 5: Publishing Strategy (Later)

When ready to publish to npm:

1. **Publish core packages first** (if not already):
   ```bash
   pnpm --filter @mieweb/jerry-agent-runtime publish
   pnpm --filter @mieweb/jerry-tools publish
   ```

2. **Update jerry-term to use published versions**:
   ```json
   {
     "dependencies": {
       "@mieweb/jerry-agent-runtime": "^0.1.0",
       "@mieweb/jerry-tools": "^0.1.0"
     }
   }
   ```

3. **Publish jerry-term**:
   ```bash
   pnpm --filter @mieweb/jerry-term publish
   ```

---

## Alternative: Truly Separate Directory (If Required)

If you need filesystem-level separation (e.g., different team, different release cadence):

```
jerry-master/           # Your local directory (not on GitHub)
├── jerry/              # Main repo (mieweb/jerry)
│   └── packages/...
└── jerry-term/         # Separate repo (mieweb/jerry-term)
    └── package.json
```

But this requires:
- Creating a new GitHub repo (`mieweb/jerry-term`)
- Publishing `@mieweb/jerry-agent-runtime` to npm first, OR
- Using git dependencies: `"@mieweb/jerry-agent-runtime": "github:mieweb/jerry#development"`

**I don't recommend this** for your current stage — it adds friction without real benefit.

---

## My Recommendation

**Go with Option 1: Same repo, `packages/jerry-term/`, branch `phase3/jerry-term`**

Reasons:
1. Matches your existing workflow (`phaseX/feature-name` branches → PR → development)
2. Zero dependency management overhead during development
3. Easy to extract to separate repo later if needed
4. `pnpm-workspace.yaml` already supports it

Want me to create the feature branch and scaffold the `packages/jerry-term/` boilerplate now?

---

**User**

It should be deliverable and users should be able to just run npm i -g jerry-term to use jerry terminal cli 


the approach we planning about will deliver this? 

---

**Cursor**

Great question — let me verify the current publish status of your dependencies.

This reveals the **critical gap**: Your core packages aren't published to npm yet.

---

## The Problem

For `npm i -g jerry-term` to work, one of these must be true:

| Approach | Requirement | Pros | Cons |
|----------|-------------|------|------|
| **A. Published deps** | Publish `@mieweb/jerry-agent-runtime` and `@mieweb/jerry-tools` to npm first | Clean separation | Must maintain multiple published packages |
| **B. Bundled (self-contained)** | Bundle all Jerry code into jerry-term | Single package, zero external deps | Larger package, code duplication |
| **C. Git dependencies** | Reference GitHub directly | No npm publish needed | Slow installs, fragile |

---

## My Recommendation: **Approach B — Self-Contained Bundle**

For your "strict isolation" requirement and best user experience, bundle everything:

```
jerry-term (published to npm)
├── Bundles @mieweb/jerry-agent-runtime code
├── Bundles @mieweb/jerry-tools code
└── Zero @mieweb/* runtime dependencies
```

### How It Works

```json
// packages/jerry-term/package.json
{
  "name": "jerry-term",
  "version": "0.1.0",
  "bin": {
    "jerry-term": "./bin/jerry-term.js"
  },
  "dependencies": {
    "ink": "^5.0.1",
    "react": "^18.3.1",
    "ai": "^4.3.0",
    "@ai-sdk/openai-compatible": "^0.2.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@mieweb/jerry-agent-runtime": "workspace:*",
    "@mieweb/jerry-tools": "workspace:*",
    "tsup": "^8.0.0"
  }
}
```

### Build Configuration

```typescript
// packages/jerry-term/tsup.config.ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  // Bundle @mieweb/* packages INTO the output
  noExternal: [
    "@mieweb/jerry-agent-runtime",
    "@mieweb/jerry-tools",
  ],
  // These remain as external npm dependencies
  external: [
    "ink",
    "react",
    "ai",
    "@ai-sdk/openai-compatible",
    "zod",
  ],
});
```

### Result

When you run `npm publish`:

```
jerry-term/
├── dist/
│   └── index.js  ← Contains bundled agent-runtime + tools code
├── bin/
│   └── jerry-term.js
└── package.json  ← Only lists ink, react, ai, zod as deps
```

Users run:
```bash
npm i -g jerry-term
jerry-term
```

And it **just works** — no need to install `@mieweb/*` packages separately.

---

## Updated Development Plan

### Phase 1: Development (workspace:*)
```
packages/jerry-term/
├── package.json  ← devDependencies: "@mieweb/*": "workspace:*"
└── src/          ← Import from @mieweb/jerry-agent-runtime
```

### Phase 2: Build (bundle)
```bash
pnpm --filter jerry-term build
# tsup bundles @mieweb/* code into dist/
```

### Phase 3: Publish
```bash
cd packages/jerry-term
npm publish
# Users: npm i -g jerry-term ✓
```

---

## Does This Deliver `npm i -g jerry-term`?

**Yes, absolutely.** Here's the user flow:

```bash
# End user installs globally
$ npm i -g jerry-term

# End user runs it
$ jerry-term
┌─────────────────────────────────────────────────────────────────┐
│ jerry-term v0.1.0                    [local] ollama:qwen2.5:3b  │
├─────────────────────────────────────────────────────────────────┤
│ > _                                                             │
└─────────────────────────────────────────────────────────────────┘
```

No additional setup. No `@mieweb/*` packages to install. Self-contained.

---

## Summary

| Question | Answer |
|----------|--------|
| Can users run `npm i -g jerry-term`? | **Yes** |
| Do we need to publish `@mieweb/*` first? | **No** (bundled) |
| Does this maintain isolation? | **Yes** (separate package, devDep only) |
| Does this work with your branch workflow? | **Yes** (`phase3/jerry-term` → PR → development) |

Want me to create the branch and scaffold with this bundled approach?

---

**User**

Approach B looks good. 
create a plan doc for this and save the plan in a phase-3.md file under @docs/plans 

---

**Cursor**

Now I'll create a comprehensive Phase 3 plan following your established format.

I've created the Phase 3 plan at `docs/plans/phase-3.md`. Here's a summary of what's covered:

---

## Phase 3 Plan Created

**File:** `docs/plans/phase-3.md`

### 7 Slices

| Slice | Goal | Key Deliverable |
|-------|------|-----------------|
| **1. Project Scaffold** | Build configuration for bundled distribution | `pnpm build` produces self-contained output |
| **2. Bridge Layer** | `JerryBridge` class wrapping agent-runtime | Dynamic runtime switching API |
| **3. Health Checks** | Diagnostics for Ollama, AW, Footnote, MCP | `/health` command |
| **4. Basic REPL** | Core readline-based interaction | Working CLI with slash commands |
| **5. Ink UI** | Rich full-screen terminal UI | React-based panels and layout |
| **6. Observability** | Real-time tool/thinking visibility | Live execution panels |
| **7. Polish & Publish** | Ship to npm | `npm i -g jerry-term` works |

### Key Design Decisions Documented

- **Bundled distribution:** `@mieweb/*` packages compiled into output (no external deps)
- **tsup configuration:** `noExternal: ["@mieweb/jerry-agent-runtime", "@mieweb/jerry-tools"]`
- **Bridge pattern:** Abstracts runtime complexity from UI layer
- **Graceful degradation:** `--no-ui` flag for basic REPL mode
- **Bun compatibility:** Explicit testing requirement

### Commands Specified

| Command | Description |
|---------|-------------|
| `/runtime <kind>` | Switch between local, ozwell, byo-cloud |
| `/health` | Show system diagnostics |
| `/config` | View/update configuration |
| `/help` | Show help |
| `/exit` | Exit CLI |

### Risk Mitigations Included

- Bundle size analysis
- Windows compatibility with `--no-ui` fallback
- Runtime API change absorption via bridge layer
- Edge case handling (mid-turn switch, timeouts, large outputs)

---

Ready to create the feature branch and start implementing Slice 1?

---

**User**

what's ink UI? 

---

**Cursor**

**Ink** is a library that lets you build terminal UIs using React components. It's essentially "React for the command line."

## What It Does

Instead of manually handling terminal escape codes, cursor positioning, and text formatting, you write declarative React components:

```tsx
import { render, Box, Text } from "ink";

const App = () => (
  <Box flexDirection="column" borderStyle="round" padding={1}>
    <Text color="green">✓ Connected</Text>
    <Text>Runtime: <Text bold>local</Text></Text>
  </Box>
);

render(<App />);
```

**Output:**
```
╭─────────────────────╮
│ ✓ Connected         │
│ Runtime: local      │
╰─────────────────────╯
```

## Why I Chose It for jerry-term

| Feature | Benefit for jerry-term |
|---------|------------------------|
| **Flexbox layout** | Easy panel arrangement (thinking, tools, response) |
| **Live updates** | Stream responses character-by-character |
| **Component reuse** | Same mental model as React web apps |
| **Built-in primitives** | `<Box>`, `<Text>`, `<Spinner>` out of the box |
| **Input handling** | Keyboard events, focus management |
| **Full-screen mode** | Persistent UI that doesn't scroll away |

## Alternatives Considered

| Library | Pros | Cons |
|---------|------|------|
| **Ink** | React-based, modern, great DX | Larger bundle |
| **blessed** | Battle-tested, low-level | Older API, complex |
| **cli-table3** | Simple tables | No interactivity |
| **Raw readline** | Zero deps | Manual everything |

## The `--no-ui` Fallback

If Ink causes issues (Windows, older terminals), the plan includes a `--no-ui` flag that falls back to basic readline-based REPL:

```bash
jerry-term --no-ui   # Plain text mode, no fancy panels
```

---

Popular CLIs using Ink: **Gatsby CLI**, **Prisma CLI**, **Shopify CLI**, **Jest** (for its watch mode UI).

---

**User**

okay, check this out too https://github.com/davila7/claude-code-templates/blob/main/cli-tool/components/agents/development-team/cli-ui-designer.md something that anrthropic uses I want you incorporate the design guidelines we can take from here. 

and add that in relevant slices of @docs/plans/phase-3.md 

---

**Cursor**

I'll incorporate the CLI UI design guidelines from the [Anthropic Claude code templates](https://github.com/davila7/claude-code-templates/blob/main/cli-tool/components/agents/development-team/cli-ui-designer.md) into the relevant slices.

Now let me update the directory structure to include the new theme and component files.

Done! I've updated `docs/plans/phase-3.md` with the CLI UI design guidelines. Here's a summary of what was added:

---

## Changes Made

### 1. New **Design System** Section (after Architecture Overview)

Incorporates terminal-native aesthetic principles from the [Anthropic CLI UI design guidelines](https://github.com/davila7/claude-code-templates/blob/main/cli-tool/components/agents/development-team/cli-ui-designer.md):

- **Terminal Color Scheme** — Dark theme with semantic colors (success, warning, error, info)
- **Typography** — Monospace font stack (`Monaco`, `Menlo`, `Ubuntu Mono`)
- **Terminal Symbols** — Standard prompts (`$`, `>`, `⎿`) and box-drawing characters
- **Status Indicators** — Colored dots and checkmarks for state visualization
- **Component Patterns** — Command sections, input prompts, tool execution displays
- **Accessibility** — WCAG AA compliance, keyboard navigation
- **Theme Support** — Dark/light mode configuration

### 2. Enhanced **Slice 5: Ink UI Framework**

Added:
- Theme system files (`src/ui/theme/colors.ts`, `index.ts`)
- New components: `StatusDot.tsx`, `TerminalBox.tsx`
- Component implementation patterns with Ink/React code examples
- Visual consistency checklist
- Keyboard shortcuts (`Ctrl+L`, `Ctrl+C`)

### 3. Enhanced **Slice 6: Observability Panels**

Added:
- Tree visualization components (`TreeView.tsx`, `CollapsibleSection.tsx`)
- Tree drawing characters documentation (`├─`, `└─`, `│`, `⎿`)
- Status indicators with color codes table
- Latency color coding function
- Collapsed panel view pattern
- Keyboard shortcuts table (`Ctrl+T`, `Ctrl+K`, `Ctrl+E`, `Tab`, `Enter`)
- Component code patterns with Ink/React examples

### 4. Updated **Directory Structure**

Added new files:
- `src/ui/theme/` — Theme system
- `StatusDot.tsx`, `TerminalBox.tsx`, `TreeView.tsx`, `CollapsibleSection.tsx`
- `useTheme.ts` hook

### 5. Updated **Slice Summary Table**

Adjusted file counts to reflect additions (Slice 5: 8→12, Slice 6: 5→7)

---

**File size:** 826 → 1109 lines (+283 lines of design documentation)

---

**User**

can we use bun to install this later? is it bun compatible? 

---

**Cursor**

Yes, Bun compatibility is already planned. Let me verify the specific considerations and what's already in the plan.

**Yes, Bun compatibility is already built into the plan.** Here's the current coverage:

---

## Bun Support in Phase 3

### What's Already Planned

| Location | Bun Reference |
|----------|---------------|
| Slice 7 Tasks | "Verify Bun compatibility: `bun x jerry-term`" |
| Slice 7 Acceptance | "`bun x jerry-term` works (Bun compatibility)" |
| Risk Mitigations | "Avoid Node-specific APIs; test both runtimes" |
| Done When | "Bun compatible (`bun x jerry-term` works)" |

### Installation Methods That Will Work

```bash
# npm (standard)
npm install -g jerry-term

# Bun global install
bun install -g jerry-term

# Bun one-shot execution (no install)
bunx jerry-term

# Bun run from local
bun x jerry-term
```

### Why It Should Work

1. **ESM-first** — Package uses `"type": "module"`, which Bun handles natively
2. **No native modules** — Dependencies are pure JS/TS:
   - `ink` (React for CLI) — Bun compatible
   - `react` — Bun compatible
   - `ai` (Vercel AI SDK) — Bun compatible
   - `zod` — Bun compatible
3. **Bundled output** — tsup produces self-contained ESM, avoiding workspace resolution issues

### Potential Concerns

| Concern | Mitigation |
|---------|------------|
| `readline` module | Use `ink`'s built-in input handling instead |
| `child_process` for MCP | Use `Bun.spawn()` with fallback or abstract behind interface |
| `conf` package (config storage) | Test with Bun; may need alternative |
| `fs` APIs | Bun supports Node's `fs` module |

### Testing Plan (Slice 7)

```bash
# Test installation
bun install -g jerry-term

# Test execution
bunx jerry-term --version
bunx jerry-term --help
bunx jerry-term "hello world"

# Test interactive mode
bunx jerry-term
```

---

**Bottom line:** The plan is designed for Bun compatibility from the start. The key constraint is avoiding Node-specific APIs that Bun doesn't support (which is increasingly rare in 2026).

Want me to add more explicit Bun testing tasks to the plan slices?

