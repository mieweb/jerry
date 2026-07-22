/**
 * Input handler for jerry-term REPL.
 *
 * Thin wrapper around Node readline.
 */

import { createInterface, Interface } from "node:readline";

export class InputReader {
  private rl: Interface;
  private closed = false;

  constructor(
    input: NodeJS.ReadableStream = process.stdin,
    output: NodeJS.WritableStream = process.stdout
  ) {
    this.rl = createInterface({
      input,
      output,
      terminal: true,
    });

    this.rl.on("close", () => {
      this.closed = true;
    });
  }

  prompt(promptText: string): Promise<string | null> {
    if (this.closed) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      this.rl.question(promptText, (answer) => {
        resolve(answer);
      });

      this.rl.once("close", () => {
        resolve(null);
      });
    });
  }

  close(): void {
    if (!this.closed) {
      this.rl.close();
      this.closed = true;
    }
  }

  isClosed(): boolean {
    return this.closed;
  }

  onSigint(handler: () => void): void {
    this.rl.on("SIGINT", handler);
  }
}
