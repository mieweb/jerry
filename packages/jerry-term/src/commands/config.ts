/**
 * /config command - view or update configuration.
 */

import type { Command, CommandContext } from "./types.ts";
import type { TermConfig } from "../config/index.ts";

const EDITABLE_KEYS: (keyof TermConfig)[] = ["runtime", "model", "apiKey", "endpoint", "egress"];

export const configCommand: Command = {
  name: "config",
  aliases: ["cfg"],
  description: "View or update configuration",
  usage: "/config [key] [value]",

  async execute(args: string[], ctx: CommandContext): Promise<void> {
    if (args.length === 0) {
      ctx.output.writeLine("Current configuration:");
      ctx.output.writeLine(`  runtime:  ${ctx.config.runtime}`);
      ctx.output.writeLine(`  model:    ${ctx.config.model}`);
      ctx.output.writeLine(`  endpoint: ${ctx.config.endpoint ?? "(default)"}`);
      ctx.output.writeLine(`  egress:   ${ctx.config.egress ?? "(default)"}`);
      ctx.output.writeLine(`  apiKey:   ${ctx.config.apiKey ? "***" : "(not set)"}`);
      return;
    }

    const key = args[0] as keyof TermConfig;
    if (!EDITABLE_KEYS.includes(key)) {
      ctx.output.writeLine(`Unknown config key: ${key}`);
      ctx.output.writeLine(`Available keys: ${EDITABLE_KEYS.join(", ")}`);
      return;
    }

    if (args.length === 1) {
      const value = ctx.config[key];
      if (key === "apiKey" && value) {
        ctx.output.writeLine(`${key}: ***`);
      } else {
        ctx.output.writeLine(`${key}: ${value ?? "(not set)"}`);
      }
      return;
    }

    const value = args.slice(1).join(" ");
    ctx.updateConfig({ [key]: value });
    ctx.output.writeLine(`Set ${key} = ${key === "apiKey" ? "***" : value}`);

    if (key === "runtime") {
      ctx.bridge.switchRuntime(value as TermConfig["runtime"]);
    }
  },
};
