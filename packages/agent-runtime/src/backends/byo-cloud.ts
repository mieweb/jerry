import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText } from "ai";
import type { AgentRuntime, PrivacyProfile, TurnInput, RuntimeEvent } from "../types.ts";
import { parseModelRef, resolveApiKey, normalizeProfile } from "../profile.ts";
import { mapStreamPartToEvents } from "../stream/map-events.ts";
import { filterTools } from "./filter-tools.ts";

/**
 * Create a byo-cloud AgentRuntime that uses Vercel AI SDK over a user-provided
 * OpenAI-compatible endpoint.
 *
 * The byo-cloud backend:
 * - Parses the model reference (URL format: "https://<url>#<model>")
 * - Creates an OpenAI-compatible provider pointing to the user's endpoint
 * - Passes API key when configured
 * - Filters tools based on egress policy
 * - Streams events via fullStream
 *
 * @throws Error if model is not in URL format (e.g. uses "ollama:")
 */
export function createByoCloudRuntime(profile: PrivacyProfile): AgentRuntime {
  const parsed = parseModelRef(profile.model);

  // byo-cloud requires URL-style model reference
  if (parsed.provider === "ollama") {
    throw new Error(
      `Runtime "byo-cloud" requires a URL-style model reference ` +
        `(e.g. "https://api.openai.com/v1#gpt-4o"), not "${profile.model}". ` +
        `Use runtime: "local" for Ollama models.`
    );
  }

  const apiKey = resolveApiKey(profile);
  const normalizedProfile = normalizeProfile(profile);

  const provider = createOpenAICompatible({
    name: "byo-cloud",
    baseURL: parsed.baseURL,
    apiKey: apiKey ?? undefined,
  });

  const model = provider(parsed.modelId);

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
