/**
 * /health command - run system health checks.
 */

import type { Command, CommandContext } from "./types.ts";
import {
  createDefaultChecks,
  runHealthChecks,
  formatHealthReport,
} from "../health/index.ts";

export const healthCommand: Command = {
  name: "health",
  aliases: ["hc"],
  description: "Run system health checks",
  usage: "/health",

  async execute(_args: string[], ctx: CommandContext): Promise<void> {
    ctx.output.writeLine("Running health checks...");
    const checks = createDefaultChecks();
    const report = await runHealthChecks(checks);
    ctx.output.writeLine(formatHealthReport(report));
  },
};
