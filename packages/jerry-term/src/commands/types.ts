/**
 * Command types for jerry-term REPL.
 */

import type { JerryBridge } from "../bridge/index.ts";
import type { TermConfig, ByoProviderId } from "../config/index.ts";
import type { IOutputWriter } from "../repl/output.ts";
import type { RuntimeKind } from "@mieweb/jerry-agent-runtime";

export interface Command {
  name: string;
  aliases?: string[];
  description: string;
  usage?: string;
  execute(args: string[], ctx: CommandContext): Promise<void>;
}

/** Picker mode for RuntimePicker */
export type PickerMode = "runtime" | "model" | "setup";

/** Callback to open the runtime/model picker UI */
export interface OpenPickerOptions {
  mode: PickerMode;
  runtime?: RuntimeKind;
  provider?: ByoProviderId;
}

export interface CommandContext {
  bridge: JerryBridge;
  config: TermConfig;
  output: IOutputWriter;
  exit: () => void;
  updateConfig: (updates: Partial<TermConfig>) => void;
  /** Optional config persistence. If not provided, uses default saveTermConfig. */
  saveConfig?: (config: TermConfig) => void;
  /** Open the runtime/model picker UI (if available in TUI mode) */
  openPicker?: (options: OpenPickerOptions) => void;
}
