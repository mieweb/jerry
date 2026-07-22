/**
 * Command types for jerry-term REPL.
 */

import type { JerryBridge } from "../bridge/index.ts";
import type { TermConfig } from "../config/index.ts";
import type { IOutputWriter } from "../repl/output.ts";

export interface Command {
  name: string;
  aliases?: string[];
  description: string;
  usage?: string;
  execute(args: string[], ctx: CommandContext): Promise<void>;
}

export interface CommandContext {
  bridge: JerryBridge;
  config: TermConfig;
  output: IOutputWriter;
  exit: () => void;
  updateConfig: (updates: Partial<TermConfig>) => void;
}
