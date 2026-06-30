import type { AgentRuntime, PrivacyProfile } from "./types.ts";
import { DEFAULT_PRIVACY_PROFILE } from "./profile.ts";
import { createLocalRuntime } from "./backends/local.ts";

/**
 * Resolve a privacy profile to an AgentRuntime instance.
 *
 * Phase 0: Only the `local` backend is implemented.
 * `byo-cloud` and `ozwell` will throw until later phases.
 *
 * @param profile - Privacy profile configuration. Defaults to DEFAULT_PRIVACY_PROFILE.
 * @returns An AgentRuntime instance for the specified backend.
 * @throws Error if the runtime is not implemented or unknown.
 */
export function resolveRuntime(
  profile: PrivacyProfile = DEFAULT_PRIVACY_PROFILE
): AgentRuntime {
  switch (profile.runtime) {
    case "local":
      return createLocalRuntime(profile);

    case "byo-cloud":
      throw new Error(
        `Runtime "byo-cloud" is not implemented in Phase 0. ` +
          `Use runtime: "local" with a local Ollama instance.`
      );

    case "ozwell":
      if (!profile.endpoint) {
        throw new Error(
          `Runtime "ozwell" requires an "endpoint" field in the profile.`
        );
      }
      throw new Error(
        `Runtime "ozwell" is not implemented in Phase 0. ` +
          `Use runtime: "local" with a local Ollama instance.`
      );

    default:
      throw new Error(
        `Unknown runtime: "${(profile as PrivacyProfile).runtime}". ` +
          `Supported runtimes: local, byo-cloud, ozwell.`
      );
  }
}
