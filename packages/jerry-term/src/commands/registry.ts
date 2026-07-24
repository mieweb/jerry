/**
 * Command registry for jerry-term REPL.
 */

import type { Command } from "./types.ts";

export class CommandRegistry {
  private commands = new Map<string, Command>();
  private aliases = new Map<string, string>();

  register(command: Command): void {
    this.commands.set(command.name, command);

    if (command.aliases) {
      for (const alias of command.aliases) {
        this.aliases.set(alias, command.name);
      }
    }
  }

  get(nameOrAlias: string): Command | undefined {
    const name = this.aliases.get(nameOrAlias) ?? nameOrAlias;
    return this.commands.get(name);
  }

  getAll(): Command[] {
    return Array.from(this.commands.values());
  }

  has(nameOrAlias: string): boolean {
    return this.get(nameOrAlias) !== undefined;
  }
}
