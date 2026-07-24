/**
 * Typography constants for jerry-term UI.
 * Ink uses terminal's monospace font by default.
 */

export const fontStack =
  "'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace";

export const symbols = {
  prompt: ">",
  systemPrompt: "$",
  continuation: "⎿",
  bullet: "•",
  checkmark: "✓",
  cross: "✗",
  warning: "⚠",
  dot: "●",
  horizontalLine: "─",
  verticalLine: "│",
  topLeft: "┌",
  topRight: "┐",
  bottomLeft: "└",
  bottomRight: "┘",
  branch: "├─",
  lastBranch: "└─",
  vertical: "│ ",
  hourglass: "⏳",
  expand: "▶",
  collapse: "▼",
} as const;

export const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

export type SymbolKey = keyof typeof symbols;
