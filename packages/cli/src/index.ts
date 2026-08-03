export const PACKAGE = "@mieweb/jerry-cli";

export { run, resolveEntry, type Entry } from "./run.js";
export { startRepl, type ReplOptions } from "./repl.js";
export { isGreeting, normalizeMessage } from "./greeting.js";
export {
  loadConfig,
  getCwdContext,
  describeProfile,
  type JerryConfig,
  type ProfileSummary,
} from "./profile.js";
