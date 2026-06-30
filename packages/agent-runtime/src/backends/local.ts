import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText, type ToolSet } from "ai";
import type { AgentRuntime, PrivacyProfile, TurnInput, RuntimeEvent } from "../types.ts";
import { parseModelRef } from "../profile.ts";
import { mapStreamPartToEvents } from "../stream/map-events.ts";

/**
 * Filter tools based on egress policy and tool dispositions.
 *
 * When `egress: deny`, only tools marked as `local` in the profile are allowed.
 * When `egress: allow-model`, same as deny (model calls allowed, not tool network access).
 * When `egress: allow-tools`, all tools are allowed (per-tool dispositions apply at call time).
 */
export function filterTools(
  tools: ToolSet | undefined,
  profile: PrivacyProfile
): ToolSet | undefined {
  if (!tools) return undefined;

  // allow-tools mode: all tools pass through, per-tool gating happens at call time
  if (profile.egress === "allow-tools") {
    return tools;
  }

  // deny or allow-model: only allow tools marked as "local"
  const toolDispositions = profile.tools ?? {};
  const filtered: ToolSet = {};

  for (const [name, tool] of Object.entries(tools)) {
    const disposition = toolDispositions[name];
    if (disposition === "local") {
      filtered[name] = tool;
    }
    // Tools with "ask" or "allow" disposition, or unknown tools, are dropped in deny/allow-model mode
  }

  return Object.keys(filtered).length > 0 ? filtered : undefined;
}

/**
 * Create a local AgentRuntime that uses Vercel AI SDK over Ollama.
 *
 * The local backend:
 * - Parses the model reference (e.g. "ollama:qwen2.5")
 * - Creates an OpenAI-compatible provider pointing to Ollama
 * - Filters tools based on egress policy
 * - Streams events via fullStream
 */
export function createLocalRuntime(profile: PrivacyProfile): AgentRuntime {
  const parsed = parseModelRef(profile.model);

  const provider = createOpenAICompatible({
    name: parsed.provider,
    baseURL: parsed.baseURL,
  });

  const model = provider(parsed.modelId);

  return {
    profile,

    async *runTurn(input: TurnInput): AsyncIterable<RuntimeEvent> {
      yield { type: "start" };

      try {
        const filteredTools = filterTools(input.tools, profile);

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
