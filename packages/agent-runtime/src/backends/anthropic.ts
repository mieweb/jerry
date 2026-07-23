import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import type { AgentRuntime, PrivacyProfile, TurnInput, RuntimeEvent } from "../types.ts";
import { resolveApiKey, normalizeProfile } from "../profile.ts";
import { mapStreamPartToEvents } from "../stream/map-events.ts";
import { filterTools } from "./filter-tools.ts";

/**
 * Create an Anthropic AgentRuntime that uses Vercel AI SDK with native Anthropic API.
 *
 * The anthropic backend:
 * - Uses bare model IDs (e.g. "claude-sonnet-4-20250514")
 * - Creates an Anthropic provider with the user's API key
 * - Filters tools based on egress policy
 * - Streams events via fullStream
 *
 * @throws Error if no API key is available
 */
export function createAnthropicRuntime(profile: PrivacyProfile): AgentRuntime {
  const apiKey = resolveApiKey(profile);
  const normalizedProfile = normalizeProfile(profile);

  if (!apiKey) {
    throw new Error(
      `Runtime "anthropic" requires an API key. ` +
        `Set ANTHROPIC_API_KEY environment variable or provide apiKey in profile.`
    );
  }

  const provider = createAnthropic({
    apiKey,
  });

  const model = provider(profile.model);

  return {
    profile: normalizedProfile,

    async *runTurn(input: TurnInput): AsyncIterable<RuntimeEvent> {
      yield { type: "start" };

      try {
        const filteredTools = filterTools(input.tools, normalizedProfile);

        const result = streamText({
          model,
          system: input.system,
          messages: input.messages,
          tools: filteredTools,
          maxSteps: input.maxSteps ?? 5,
        });

        for await (const part of result.fullStream) {
          yield* mapStreamPartToEvents(part);
        }
      } catch (error) {
        yield {
          type: "error",
          message: error instanceof Error ? error.message : String(error),
          cause: error,
        };
      }
    },
  };
}
