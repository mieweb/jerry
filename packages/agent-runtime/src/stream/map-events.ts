import type { TextStreamPart } from "ai";
import type { RuntimeEvent } from "../types.ts";

/**
 * Map AI SDK stream parts to RuntimeEvent.
 *
 * Handles the core event types from streamText's fullStream:
 * - text-delta → text-delta
 * - tool-call → tool-call
 * - tool-result → tool-result
 * - finish → finish
 * - error → error
 *
 * Other event types (step-start, step-finish, etc.) are ignored.
 */
export function* mapStreamPartToEvents(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  part: TextStreamPart<any>
): Generator<RuntimeEvent> {
  switch (part.type) {
    case "text-delta":
      yield { type: "text-delta", text: part.textDelta };
      break;

    case "tool-call":
      yield {
        type: "tool-call",
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.args,
      };
      break;

    case "tool-result":
      yield {
        type: "tool-result",
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        output: part.result,
      };
      break;

    case "finish":
      yield {
        type: "finish",
        finishReason: part.finishReason ?? "unknown",
        usage: part.usage,
      };
      break;

    case "error":
      yield {
        type: "error",
        message: part.error instanceof Error ? part.error.message : String(part.error),
        cause: part.error,
      };
      break;

    // Ignore other event types (step-start, step-finish, etc.)
    default:
      break;
  }
}
