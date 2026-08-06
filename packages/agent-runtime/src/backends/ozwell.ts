import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText } from "ai";
import { OzwellAI } from "ozwellai";
import type { AgentRuntime, PrivacyProfile, TurnInput, RuntimeEvent } from "../types.ts";
import { DEFAULT_MAX_OUTPUT_TOKENS } from "../types.ts";
import {
  DEFAULT_OZWELL_ENDPOINT,
  resolveApiKey,
  resolveOzwellModelId,
  normalizeProfile,
  DEFAULT_PRIVACY_PROFILE,
} from "../profile.ts";
import { mapStreamPartToEvents } from "../stream/map-events.ts";
import { filterTools } from "./filter-tools.ts";
import { createLocalRuntime } from "./local.ts";

/**
 * Check if Ozwell endpoint accepts the given key.
 * Prefer a tiny chat completion — `/v1/models` is often unauthenticated on Manager hosts.
 */
async function probeOzwell(endpoint: string, apiKey: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const client = new OzwellAI({
      apiKey,
      baseURL: endpoint,
      timeout: 12000,
    });
    await client.createChatCompletion({
      model: "gpt-4.1-mini",
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
      stream: false,
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if an error indicates Ozwell is unavailable (network/auth/server error).
 */
function isOzwellUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();

  // Network / transport
  if (
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("timeout") ||
    msg.includes("abort") ||
    msg.includes("econnreset")
  ) {
    return true;
  }

  // Auth / key problems (Ozwell returns these without always embedding "401")
  if (
    msg.includes("401") ||
    msg.includes("403") ||
    msg.includes("unauthorized") ||
    msg.includes("api key not found") ||
    msg.includes("invalid or missing api key") ||
    msg.includes("invalid api key") ||
    msg.includes("authentication")
  ) {
    return true;
  }

  // Server errors
  if (/http\s*5\d{2}/.test(msg) || /\b5\d{2}\b/.test(msg)) {
    return true;
  }

  return false;
}

function isAgentKey(apiKey: string | undefined): boolean {
  return Boolean(apiKey?.startsWith("agnt_key-"));
}

async function* runLocalFallback(
  createFallback: (profile: PrivacyProfile) => AgentRuntime,
  input: TurnInput,
  notice: string
): AsyncGenerator<RuntimeEvent> {
  yield { type: "text-delta", text: notice };

  const fallbackRuntime = createFallback({
    ...DEFAULT_PRIVACY_PROFILE,
    runtime: "local",
  });

  let skippedStart = false;
  for await (const event of fallbackRuntime.runTurn(input)) {
    if (!skippedStart && event.type === "start") {
      skippedStart = true;
      continue;
    }
    yield event;
  }
}

/**
 * Create an Ozwell AgentRuntime that uses Vercel AI SDK over Ozwell's
 * OpenAI-compatible endpoint.
 *
 * Jerry keeps its own tool loop; Ozwell is just the model endpoint.
 * Prefer parent keys (`ozw_`). Agent keys (`agnt_key-`) inject Ozwell-side
 * persona/tools that conflict with Jerry's local tools.
 *
 * On network/auth failure, falls back to local Ollama with a visible notice.
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
  const modelId = resolveOzwellModelId(profile);

  const createFallback = options?.createLocalFallback ?? createLocalRuntime;

  const provider = createOpenAICompatible({
    name: "ozwell",
    baseURL: `${endpoint}/v1`,
    apiKey: apiKey ?? "unused",
  });

  const model = provider(modelId);

  let hasFallenBack = false;
  let fallbackRuntime: AgentRuntime | null = null;
  let probedOk: boolean | null = options?.skipProbe ? true : null;

  return {
    profile: normalizedProfile,

    async *runTurn(input: TurnInput): AsyncIterable<RuntimeEvent> {
      if (hasFallenBack && fallbackRuntime) {
        yield* fallbackRuntime.runTurn(input);
        return;
      }

      yield { type: "start" };

      if (!apiKey) {
        hasFallenBack = true;
        fallbackRuntime = createFallback({
          ...DEFAULT_PRIVACY_PROFILE,
          runtime: "local",
        });
        try {
          yield* runLocalFallback(
            () => fallbackRuntime!,
            input,
            "[jerry] No Ozwell API key configured. Falling back to local Ollama.\n"
          );
        } catch (localError) {
          yield {
            type: "error",
            message: `Ozwell unavailable (no API key) and local Ollama also failed: ${
              localError instanceof Error ? localError.message : String(localError)
            }`,
            cause: localError,
          };
        }
        return;
      }

      // Probe once so bad keys fail over before streaming partial text
      if (probedOk === null) {
        const probe = await probeOzwell(endpoint, apiKey);
        probedOk = probe.ok;
        if (!probe.ok) {
          hasFallenBack = true;
          fallbackRuntime = createFallback({
            ...DEFAULT_PRIVACY_PROFILE,
            runtime: "local",
          });
          try {
            yield* runLocalFallback(
              () => fallbackRuntime!,
              input,
              `[jerry] Ozwell unavailable (${probe.error}). Falling back to local Ollama.\n`
            );
          } catch (localError) {
            yield {
              type: "error",
              message: `Ozwell unavailable and local Ollama also failed: ${
                localError instanceof Error ? localError.message : String(localError)
              }`,
              cause: localError,
            };
          }
          return;
        }
      }

      if (isAgentKey(apiKey)) {
        yield {
          type: "text-delta",
          text:
            "[jerry] Warning: using an Ozwell agent key (agnt_key-). " +
            "Agent keys apply Ozwell-side persona/tools and often ignore Jerry's local tools " +
            "(e.g. summarize_activity). Prefer OZWELL_API_KEY=ozw_... for full Jerry tool use.\n",
        };
      }

      try {
        const filteredTools = filterTools(input.tools, normalizedProfile);

        const result = streamText({
          model,
          system: input.system,
          messages: input.messages,
          tools: filteredTools,
          maxSteps: input.maxSteps ?? 5,
          maxTokens: input.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
          // Prefer tool use when Jerry tools are available (activity summaries, etc.)
          toolChoice: filteredTools && Object.keys(filteredTools).length > 0 ? "auto" : undefined,
        });

        for await (const part of result.fullStream) {
          // AI SDK often surfaces auth/network failures as stream error parts (not throws)
          if (part.type === "error") {
            const streamError =
              part.error instanceof Error
                ? part.error
                : new Error(String(part.error));
            if (isOzwellUnavailableError(streamError)) {
              hasFallenBack = true;
              fallbackRuntime = createFallback({
                ...DEFAULT_PRIVACY_PROFILE,
                runtime: "local",
              });
              try {
                yield* runLocalFallback(
                  () => fallbackRuntime!,
                  input,
                  `[jerry] Ozwell unavailable (${streamError.message}). Falling back to local Ollama.\n`
                );
              } catch (localError) {
                yield {
                  type: "error",
                  message: `Ozwell unavailable and local Ollama also failed: ${
                    localError instanceof Error ? localError.message : String(localError)
                  }`,
                  cause: localError,
                };
              }
              return;
            }
          }

          yield* mapStreamPartToEvents(part);
        }
      } catch (error) {
        if (isOzwellUnavailableError(error)) {
          hasFallenBack = true;
          fallbackRuntime = createFallback({
            ...DEFAULT_PRIVACY_PROFILE,
            runtime: "local",
          });
          try {
            yield* runLocalFallback(
              () => fallbackRuntime!,
              input,
              `[jerry] Ozwell unavailable (${
                error instanceof Error ? error.message : "unknown error"
              }). Falling back to local Ollama.\n`
            );
          } catch (localError) {
            yield {
              type: "error",
              message: `Ozwell unavailable and local Ollama also failed: ${
                localError instanceof Error ? localError.message : String(localError)
              }`,
              cause: localError,
            };
          }
          return;
        }

        yield {
          type: "error",
          message: error instanceof Error ? error.message : String(error),
          cause: error,
        };
      }
    },
  };
}

export { probeOzwell, isOzwellUnavailableError };
