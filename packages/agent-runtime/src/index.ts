export const PACKAGE = "@mieweb/jerry-agent-runtime";

// Types
export type {
  RuntimeKind,
  EgressPolicy,
  ToolEgress,
  McpServerConfig,
  PrivacyProfile,
  TurnInput,
  RuntimeEvent,
  AgentRuntime,
} from "./types.ts";

// Profile utilities
export {
  DEFAULT_PRIVACY_PROFILE,
  DEFAULT_OZWELL_ENDPOINT,
  DEFAULT_OZWELL_MODEL,
  parseModelRef,
  mergeProfile,
  resolveApiKey,
  resolveOzwellModelId,
  normalizeProfile,
} from "./profile.ts";

// Runtime resolver
export { resolveRuntime } from "./resolve-runtime.ts";

// Backends
export { createLocalRuntime } from "./backends/local.ts";
export { createByoCloudRuntime } from "./backends/byo-cloud.ts";
export { createOzwellRuntime } from "./backends/ozwell.ts";
export { createAnthropicRuntime } from "./backends/anthropic.ts";
export { filterTools } from "./backends/filter-tools.ts";
