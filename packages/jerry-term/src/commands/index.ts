/**
 * Commands module for jerry-term REPL.
 */

export type { Command, CommandContext, PickerMode, OpenPickerOptions } from "./types.ts";
export { CommandRegistry } from "./registry.ts";
export { runtimeCommand } from "./runtime.ts";
export { modelCommand } from "./model.ts";
export { healthCommand } from "./health.ts";
export { awTailCommand } from "./aw.ts";
export { configCommand } from "./config.ts";
export { createHelpCommand } from "./help.ts";
export { exitCommand } from "./exit.ts";
export { applyConfigToBridge } from "./apply-config.ts";

import { CommandRegistry } from "./registry.ts";
import { runtimeCommand } from "./runtime.ts";
import { modelCommand } from "./model.ts";
import { healthCommand } from "./health.ts";
import { awTailCommand } from "./aw.ts";
import { configCommand } from "./config.ts";
import { createHelpCommand } from "./help.ts";
import { exitCommand } from "./exit.ts";

export function createDefaultRegistry(): CommandRegistry {
  const registry = new CommandRegistry();
  registry.register(runtimeCommand);
  registry.register(modelCommand);
  registry.register(healthCommand);
  registry.register(awTailCommand);
  registry.register(configCommand);
  registry.register(createHelpCommand(registry));
  registry.register(exitCommand);
  return registry;
}
