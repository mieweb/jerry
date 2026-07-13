import type { CoreMessage, LanguageModelUsage, ToolSet } from "ai";

/**
 * Runtime backend kind.
 * - `local`: In-process loop over local Ollama (OpenAI-compatible). Nothing leaves the machine.
 * - `byo-cloud`: Same loop, pointed at user's chosen OpenAI-compatible LLM. Only model payloads leave.
 * - `ozwell`: Managed path via the Ozwell agent system.
 */
export type RuntimeKind = "local" | "byo-cloud" | "ozwell";

/**
 * Egress policy for the runtime.
 * - `deny`: Fully offline; any tool that would touch the network is hard-disabled.
 * - `allow-model`: Model calls may leave (to user's configured endpoint); everything else stays local.
 * - `allow-tools`: Explicit tools may reach out (gated per-tool).
 */
export type EgressPolicy = "deny" | "allow-model" | "allow-tools";

/**
 * Per-tool egress disposition.
 * - `local`: Tool runs locally, no network access.
 * - `ask`: Tool may reach out, but requires human-in-the-loop approval first.
 * - `allow`: Tool may reach out without approval.
 */
export type ToolEgress = "local" | "ask" | "allow";

/**
 * MCP server configuration for stdio-based servers.
 */
export interface McpServerConfig {
  /** Unique name for this server (e.g. "footnote") */
  name: string;
  /** Command to execute (e.g. "node") */
  command: string;
  /** Arguments to pass to the command (e.g. ["bin/docidx.js", "mcp"]) */
  args?: string[];
  /** Environment variables to set for the process */
  env?: Record<string, string>;
}

/**
 * Privacy profile configuration.
 * Names the runtime and what may leave the machine.
 * See plan.md §4 for full design.
 */
export interface PrivacyProfile {
  /** Runtime backend to use */
  runtime: RuntimeKind;
  /** Model reference, e.g. "ollama:qwen2.5" or "https://api.openai.com/v1#gpt-4o" */
  model: string;
  /** Egress policy for model inference */
  egress: EgressPolicy;
  /** Per-tool egress dispositions */
  tools?: Record<string, ToolEgress>;
  /** Ozwell endpoint (required for ozwell runtime) */
  endpoint?: string;
  /** Ozwell agent ID (optional for ozwell runtime) */
  agentId?: string;
  /** MCP server configurations for tool providers */
  mcp?: {
    servers?: McpServerConfig[];
  };
}

/**
 * Input for a single turn of the agent runtime.
 */
export interface TurnInput {
  /** Conversation messages */
  messages: CoreMessage[];
  /** Tools available to the model */
  tools?: ToolSet;
  /** System prompt */
  system?: string;
  /** Maximum number of tool-call steps (default: 5) */
  maxSteps?: number;
}

/**
 * Events emitted during a turn.
 * Minimal, backend-agnostic events for streaming to CLI/UI.
 */
export type RuntimeEvent =
  | { type: "start" }
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown }
  | { type: "tool-result"; toolCallId: string; toolName: string; output: unknown }
  | { type: "finish"; finishReason: string; usage?: LanguageModelUsage }
  | { type: "error"; message: string; cause?: unknown };

/**
 * The AgentRuntime port.
 * Executes a turn and streams events. Both local and Ozwell backends satisfy this interface.
 */
export interface AgentRuntime {
  /** The privacy profile this runtime was created with */
  readonly profile: PrivacyProfile;
  /** Execute a turn and yield events */
  runTurn(input: TurnInput): AsyncIterable<RuntimeEvent>;
}
