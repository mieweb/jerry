/**
 * /runtime command - switch runtime backend.
 */

import type { RuntimeKind } from "@mieweb/jerry-agent-runtime";
import type { Command, CommandContext } from "./types.ts";

const VALID_RUNTIMES: RuntimeKind[] = ["local", "ozwell", "byo-cloud"];

export const runtimeCommand: Command = {
  name: "runtime",
  aliases: ["rt"],
  description: "Switch runtime: local, ozwell, byo-cloud",
  usage: "/runtime <kind>",

  async execute(args: string[], ctx: CommandContext): Promise<void> {
    if (args.length === 0) {
      const current = ctx.bridge.getRuntimeKind();
      ctx.output.writeLine(`Current runtime: ${current}`);
      ctx.output.writeLine(`Available: ${VALID_RUNTIMES.join(", ")}`);
      return;
    }

    const kind = args[0] as RuntimeKind;
    if (!VALID_RUNTIMES.includes(kind)) {
      ctx.output.writeLine(`Invalid runtime: ${kind}`);
      ctx.output.writeLine(`Available: ${VALID_RUNTIMES.join(", ")}`);
      return;
    }

    ctx.bridge.switchRuntime(kind);
    ctx.updateConfig({ runtime: kind });
    ctx.output.writeLine(`Switched to ${kind} runtime`);
  },
};
