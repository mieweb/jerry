export const PACKAGE = "@mieweb/jerry-cli";

export { run, resolveEntry, type Entry } from "./run.js";
export {
  startRepl,
  setRuntime,
  setModel,
  renderRuntimeList,
  renderModelList,
  type ReplOptions,
  type ReplContext,
  type SlashResult,
} from "./repl.js";
export { isGreeting, normalizeMessage } from "./greeting.js";
export {
  loadConfig,
  getCwdContext,
  describeProfile,
  type JerryConfig,
  type ProfileSummary,
} from "./profile.js";
export { loadEnv, findEnvFile, parseEnvFile } from "./load-env.js";
export {
  findRuntime,
  findModel,
  modelsForRuntime,
  defaultModelForRuntime,
  describeRuntimeReadiness,
  isModelReady,
  resolveModelApiKey,
  parseModelRef,
  toProfileModel,
  currentRuntimeId,
  MODELS,
  RUNTIMES,
  type ModelInfo,
  type RuntimeInfo,
  type RuntimeId,
} from "./catalog.js";
