import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText } from "ai";
import { OzwellAI } from "ozwellai";
import type { AgentRuntime, PrivacyProfile, TurnInput, RuntimeEvent } from "../types.ts";
import { DEFAULT_OZWELL_ENDPOINT, resolveApiKey, normalizeProfile, DEFAULT_PRIVACY_PROFILE } from "../profile.ts";
import { mapStreamPartToEvents } from "../stream/map-events.ts";
import { filterTools } from "./filter-tools.ts";
import { createLocalRuntime } from "./local.ts";

/**
 * Check if Ozwell endpoint is reachable.
 * Uses lightweight listModels call as health probe.
 */
async function probeOzwell(endpoint: string, apiKey: string): Promise<boolean> {
  try {
    const client = new OzwellAI({
      apiKey,
      baseURL: endpoint,
      timeout: 5000,
    });
    await client.listModels();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if an error indicates Ozwell is unavailable (network/auth/server error).
 */
function isOzwellUnavailableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    // Network errors
    if (
      msg.includes("fetch failed") ||
      msg.includes("network") ||
      msg.includes("econnrefused") ||
      msg.includes("timeout") ||
      msg.includes("abort")
    ) {
      return true;
    }
    // Auth errors (401, 403)
    if (msg.includes("401") || msg.includes("403") || msg.includes("unauthorized")) {
      return true;
    }
    // Server errors (5xx)
    if (/5\d{2}/.test(msg)) {
      return true;
    }
  }
  return false;
}

/**
 * Create an Ozwell AgentRuntime that uses Vercel AI SDK over Ozwell's
 * OpenAI-compatible endpoint.
 *
 * The ozwell backend:
 * - Uses the configured Ozwell endpoint (default: Manager host)
 * - Requires an API key (ozw_ or agnt_key-)
 * - Falls back to local Ollama if Ozwell is unavailable
 * - Emits a warning message when falling back
 *
 * Jerry keeps its own tool loop; Ozwell is just the model endpoint.
 * Agent keys may inject Ozwell-side system persona.
 *
 * @param profile - Privacy profile with endpoint and apiKey
 * @param options - Optional configuration for testing
 */
export function createOzwellRuntime(
  profile: PrivacyProfile,
  options?: {
    /** Skip initial probe (for testing) */
    skipProbe?: boolean;
    /** Override local runtime factory (for testing) */
    createLocalFallback?: (profile: PrivacyProfile) => AgentRuntime;
  }
): AgentRuntime {
  const endpoint = profile.endpoint ?? DEFAULT_OZWELL_ENDPOINT;
  const apiKey = resolveApiKey(profile);
  const normalizedProfile = normalizeProfile(profile);

  const createFallback = options?.createLocalFallback ?? createLocalRuntime;

  // Create the Ozwell-backed provider
  const provider = createOpenAICompatible({
    name: "ozwell",
    baseURL: `${endpoint}/v1`,
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
  });

  // Parse model from profile or use default
  // For ozwell, model can be simple like "gpt-4.1-mini" (not URL format)
  const modelId = profile.model.includes("#")
    ? profile.model.split("#")[1]
    : profile.model.startsWith("ollama:")
      ? "gpt-4.1-mini" // Default Ozwell model if ollama format used
      : profile.model;

  const model = provider(modelId);

  // Track whether we've fallen back
  let hasFallenBack = false;
  let fallbackRuntime: AgentRuntime | null = null;

  return {
    profile: normalizedProfile,

    async *runTurn(input: TurnInput): AsyncIterable<RuntimeEvent> {
      // If we've already fallen back, use the fallback runtime
      if (hasFallenBack && fallbackRuntime) {
        yield* fallbackRuntime.runTurn(input);
        return;
      }

      yield { type: "start" };

      // If no API key and this is the first turn, emit error and try fallback
      if (!apiKey) {
        yield {
          type: "text-delta",
          text: "[jerry] No Ozwell API key configured. Falling back to local Ollama.\n",
        };

        try {
          // Create local fallback with default profile
          fallbackRuntime = createFallback({
            ...DEFAULT_PRIVACY_PROFILE,
            runtime: "local",
          });
          hasFallenBack = true;

          // Run the turn on local
          const localTurn = fallbackRuntime.runTurn(input);
          // Skip the "start" event from local since we already emitted it
          let skippedStart = false;
          for await (const event of localTurn) {
            if (!skippedStart && event.type === "start") {
              skippedStart = true;
              continue;
            }
            yield event;
          }
          return;
        } catch (localError) {
          yield {
            type: "error",
            message: `Ozwell unavailable (no API key) and local Ollama also failed: ${
              localError instanceof Error ? localError.message : String(localError)
            }`,
            cause: localError,
          };
          return;
        }
      }

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
        // Check if this is a recoverable error where we should fallback
        if (isOzwellUnavailableError(error)) {
          yield {
            type: "text-delta",
            text: `[jerry] Ozwell unavailable (${
              error instanceof Error ? error.message : "unknown error"
            }). Falling back to local Ollama.\n`,
          };

          try {
            // Create local fallback
            fallbackRuntime = createFallback({
              ...DEFAULT_PRIVACY_PROFILE,
              runtime: "local",
            });
            hasFallenBack = true;

            // Run the turn on local
            const localTurn = fallbackRuntime.runTurn(input);
            // Skip the "start" event from local since we already emitted it
            let skippedStart = false;
            for await (const event of localTurn) {
              if (!skippedStart && event.type === "start") {
                skippedStart = true;
                continue;
              }
              yield event;
            }
            return;
          } catch (localError) {
            yield {
              type: "error",
              message: `Ozwell unavailable and local Ollama also failed: ${
                localError instanceof Error ? localError.message : String(localError)
              }`,
              cause: localError,
            };
            return;
          }
        }

        // Non-recoverable error (e.g., bad request)
        yield {
          type: "error",
          message: error instanceof Error ? error.message : String(error),
          cause: error,
        };
      }
    },
  };
}

// Export the probe function for testing
export { probeOzwell };
