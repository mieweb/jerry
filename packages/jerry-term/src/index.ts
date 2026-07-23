/**
 * jerry-term - Interactive terminal CLI for Jerry AI agent.
 *
 * This is the library entry point. For CLI usage, see cli.ts.
 */

import { createLocalRuntime } from "@mieweb/jerry-agent-runtime";
import { JerryBridge } from "./bridge/index.ts";

// Re-export CLI entry point and version
export { VERSION, run, runHealth, parseCliArgs } from "./cli.ts";
export type { CliOptions } from "./cli.ts";

// Library exports
export { createLocalRuntime };
export { JerryBridge };
export * from "./health/index.ts";
export * from "./config/index.ts";
export * from "./commands/index.ts";
export * from "./repl/index.ts";

// CLI entry point when run directly
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("/jerry-term/src/index.ts");

if (isMain) {
  import("./cli.ts").then(({ run }) => {
    run(process.argv.slice(2)).catch((error) => {
      console.error(error);
      process.exit(1);
    });
  });
}
