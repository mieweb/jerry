/**
 * /help command - show help information.
 */

import type { Command, CommandContext } from "./types.ts";
import type { CommandRegistry } from "./registry.ts";

export function createHelpCommand(registry: CommandRegistry): Command {
  return {
    name: "help",
    aliases: ["h", "?"],
    description: "Show help",
    usage: "/help [command]",

    async execute(args: string[], ctx: CommandContext): Promise<void> {
      if (args.length > 0) {
        const cmdName = args[0].replace(/^\//, "");
        const cmd = registry.get(cmdName);
        if (cmd) {
          ctx.output.writeLine(`/${cmd.name}`);
          if (cmd.aliases?.length) {
            ctx.output.writeLine(`  Aliases: ${cmd.aliases.map((a) => `/${a}`).join(", ")}`);
          }
          ctx.output.writeLine(`  ${cmd.description}`);
          if (cmd.usage) {
            ctx.output.writeLine(`  Usage: ${cmd.usage}`);
          }
        } else {
          ctx.output.writeLine(`Unknown command: ${cmdName}`);
        }
        return;
      }

      ctx.output.writeLine("Available commands:");
      ctx.output.writeLine("");
      for (const cmd of registry.getAll()) {
        const aliases = cmd.aliases?.length ? ` (${cmd.aliases.map((a) => `/${a}`).join(", ")})` : "";
        ctx.output.writeLine(`  /${cmd.name}${aliases}`);
        ctx.output.writeLine(`    ${cmd.description}`);
      }
      ctx.output.writeLine("");
      ctx.output.writeLine("Type any text without / to chat with Jerry.");
    },
  };
}
