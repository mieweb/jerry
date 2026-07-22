import { createLocalRuntime } from "@mieweb/jerry-agent-runtime";
import { JerryBridge } from "./bridge/index.ts";
import {
  createDefaultChecks,
  runHealthChecks,
  formatHealthReport,
} from "./health/index.ts";
import { loadTermConfig, termConfigToProfile } from "./config/index.ts";
import { createDefaultRegistry } from "./commands/index.ts";
import { Repl } from "./repl/index.ts";

const VERSION = "0.1.0";

export { createLocalRuntime };
export { JerryBridge };
export * from "./health/index.ts";
export * from "./config/index.ts";
export * from "./commands/index.ts";
export * from "./repl/index.ts";

export async function runHealth(): Promise<number> {
  const checks = createDefaultChecks();
  const report = await runHealthChecks(checks);
  console.log(formatHealthReport(report));
  return report.overall === "error" ? 1 : 0;
}

export async function run(args: string[]): Promise<void> {
  if (args.includes("--version") || args.includes("-V")) {
    console.log(`jerry-term v${VERSION}`);
    return;
  }

  if (args.includes("--health") || args.includes("-H")) {
    const code = await runHealth();
    process.exit(code);
  }

  const config = loadTermConfig();
  const bridge = new JerryBridge(termConfigToProfile(config));
  const registry = createDefaultRegistry();
  const repl = new Repl(bridge, config, registry);

  await repl.start();
}
