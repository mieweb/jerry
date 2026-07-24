import type { AgentRuntime, PrivacyProfile } from "./types.ts";
import { DEFAULT_PRIVACY_PROFILE } from "./profile.ts";
import { createLocalRuntime } from "./backends/local.ts";
import { createByoCloudRuntime } from "./backends/byo-cloud.ts";
import { createOzwellRuntime } from "./backends/ozwell.ts";
import { createAnthropicRuntime } from "./backends/anthropic.ts";

/**
 * Resolve a privacy profile to an AgentRuntime instance.
 *
 * Supports four runtime backends:
 * - `local`: Vercel AI SDK over local Ollama
 * - `byo-cloud`: Vercel AI SDK over user's OpenAI-compatible endpoint
 * - `ozwell`: Vercel AI SDK over Ozwell Manager endpoint with fallback to local
 * - `anthropic`: Vercel AI SDK over native Anthropic API
 *
 * @param profile - Privacy profile configuration. Defaults to DEFAULT_PRIVACY_PROFILE.
 * @returns An AgentRuntime instance for the specified backend.
 * @throws Error if the runtime is unknown or configuration is invalid.
 */
export function resolveRuntime(
  profile: PrivacyProfile = DEFAULT_PRIVACY_PROFILE
): AgentRuntime {
  switch (profile.runtime) {
    case "local":
      return createLocalRuntime(profile);

    case "byo-cloud":
      return createByoCloudRuntime(profile);

    case "ozwell":
      // Ozwell has a default endpoint (Manager host), so no endpoint check needed
      return createOzwellRuntime(profile);

    case "anthropic":
      return createAnthropicRuntime(profile);

    default:
      throw new Error(
        `Unknown runtime: "${(profile as PrivacyProfile).runtime}". ` +
          `Supported runtimes: local, byo-cloud, ozwell, anthropic.`
      );
  }
}
