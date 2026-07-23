/**
 * Main REPL loop for jerry-term.
 */

import type { CoreMessage, ToolSet } from "ai";
import type { JerryBridge } from "../bridge/index.ts";
import type { TermConfig } from "../config/index.ts";
import type { CommandRegistry, CommandContext } from "../commands/index.ts";
import { InputReader } from "./input.ts";
import { OutputWriter } from "./output.ts";
import { createLocalTools } from "../tools/index.ts";
import { getWelcomeMessage } from "../welcome/index.ts";

const COMMAND_REGEX = /^\/(\S+)\s*(.*)/;

export class Repl {
  private bridge: JerryBridge;
  private config: TermConfig;
  private registry: CommandRegistry;
  private input: InputReader;
  private output: OutputWriter;
  private running = false;
  private messages: CoreMessage[] = [];
  private tools: ToolSet;

  constructor(
    bridge: JerryBridge,
    config: TermConfig,
    registry: CommandRegistry
  ) {
    this.bridge = bridge;
    this.config = config;
    this.registry = registry;
    this.input = new InputReader();
    this.output = new OutputWriter();
    this.tools = createLocalTools();
  }

  async start(): Promise<void> {
    this.running = true;

    this.input.onSigint(() => {
      this.output.newLine();
      this.output.writeLine("Goodbye!");
      this.stop();
    });

    const welcomeLines = getWelcomeMessage(this.config);
    for (const line of welcomeLines) {
      this.output.writeLine(line);
    }
    this.output.newLine();

    while (this.running) {
      const line = await this.input.prompt("> ");

      if (line === null) {
        break;
      }

      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const commandMatch = trimmed.match(COMMAND_REGEX);
      if (commandMatch) {
        await this.handleCommand(commandMatch[1], commandMatch[2]);
      } else {
        await this.handleChat(trimmed);
      }
    }
  }

  stop(): void {
    this.running = false;
    this.input.close();
  }

  private async handleCommand(name: string, argsStr: string): Promise<void> {
    const command = this.registry.get(name);
    if (!command) {
      this.output.writeLine(`Unknown command: /${name}`);
      this.output.writeLine(`Type /help for available commands.`);
      return;
    }

    const args = argsStr.trim() ? argsStr.trim().split(/\s+/) : [];
    const ctx: CommandContext = {
      bridge: this.bridge,
      config: this.config,
      output: this.output,
      exit: () => this.stop(),
      updateConfig: (updates) => {
        this.config = { ...this.config, ...updates };
      },
    };

    try {
      await command.execute(args, ctx);
    } catch (error) {
      this.output.writeLine(
        `Error: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleChat(text: string): Promise<void> {
    this.messages.push({ role: "user", content: text });

    let assistantContent = "";

    try {
      for await (const event of this.bridge.runTurn({
        messages: this.messages,
        tools: this.tools,
      })) {
        switch (event.type) {
          case "text-delta":
            this.output.streamText(event.text);
            assistantContent += event.text;
            break;
          case "tool-call":
            this.output.writeLine(`\n[tool] ${event.toolName}...`);
            break;
          case "tool-result":
            this.output.writeLine(`[result] ${event.toolName} done`);
            break;
          case "finish":
            this.output.newLine();
            if (assistantContent) {
              this.messages.push({ role: "assistant", content: assistantContent });
            }
            break;
          case "error":
            this.output.writeLine(`\nError: ${event.message}`);
            break;
        }
      }
    } catch (error) {
      this.output.writeLine(
        `\nError: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    this.output.newLine();
  }
}
