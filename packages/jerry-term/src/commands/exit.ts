/**
 * /exit command - exit the CLI.
 */

import type { Command, CommandContext } from "./types.ts";

export const exitCommand: Command = {
  name: "exit",
  aliases: ["q", "quit"],
  description: "Exit the CLI",
  usage: "/exit",

  async execute(_args: string[], ctx: CommandContext): Promise<void> {
    ctx.output.writeLine("Goodbye!");
    ctx.exit();
  },
};
