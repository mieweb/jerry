/**
 * Output writer for jerry-term REPL.
 *
 * Wraps process.stdout with helpers for text output and streaming.
 */

export class OutputWriter {
  private stream: NodeJS.WriteStream;

  constructor(stream: NodeJS.WriteStream = process.stdout) {
    this.stream = stream;
  }

  write(text: string): void {
    this.stream.write(text);
  }

  writeLine(text: string): void {
    this.stream.write(text + "\n");
  }

  streamText(delta: string): void {
    this.stream.write(delta);
  }

  newLine(): void {
    this.stream.write("\n");
  }

  clear(): void {
    if (this.stream.isTTY) {
      this.stream.write("\x1b[2J\x1b[H");
    }
  }
}
