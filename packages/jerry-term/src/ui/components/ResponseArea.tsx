/**
 * TranscriptLine type for response/transcript display.
 * The actual rendering is now handled inline in App.tsx using OpenTUI scrollbox.
 */

export interface TranscriptLine {
  id: string;
  type: "user" | "assistant" | "tool" | "result" | "system" | "error";
  content: string;
}
