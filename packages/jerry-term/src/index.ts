import { createLocalRuntime } from "@mieweb/jerry-agent-runtime";

const VERSION = "0.1.0";

export { createLocalRuntime };

export function run(args: string[]): void {
  if (args.includes("--version") || args.includes("-V")) {
    console.log(`jerry-term v${VERSION}`);
    return;
  }

  console.log(`jerry-term v${VERSION} - scaffold complete`);
  console.log("Full REPL coming in Slice 4+");
}
