/**
 * Health check module for jerry-term.
 *
 * Provides health check adapters for system dependencies and a parallel runner.
 */

export type {
  HealthCheck,
  HealthCheckOptions,
  HealthStatus,
  HealthResult,
  HealthReportEntry,
  HealthReport,
} from "./types.ts";

export { createOllamaCheck } from "./ollama.ts";
export type { OllamaCheckOptions } from "./ollama.ts";

export { createActivityWatchCheck } from "./activity-watch.ts";
export type { ActivityWatchCheckOptions } from "./activity-watch.ts";

export { createFootnoteCheck } from "./footnote.ts";
export type { FootnoteCheckOptions } from "./footnote.ts";

export { createMcpToolsCheck } from "./mcp-tools.ts";
export type { McpToolsCheckOptions } from "./mcp-tools.ts";

export { runHealthChecks } from "./runner.ts";
export type { RunnerOptions } from "./runner.ts";

export { formatHealthReport } from "./format.ts";

import type { HealthCheck } from "./types.ts";
import { createOllamaCheck } from "./ollama.ts";
import { createActivityWatchCheck } from "./activity-watch.ts";
import { createFootnoteCheck } from "./footnote.ts";
import { createMcpToolsCheck } from "./mcp-tools.ts";

export function createDefaultChecks(): HealthCheck[] {
  return [
    createOllamaCheck(),
    createActivityWatchCheck(),
  ];
}

export function createAllChecks(): HealthCheck[] {
  return [
    createOllamaCheck(),
    createActivityWatchCheck(),
    createFootnoteCheck(),
    createMcpToolsCheck(),
  ];
}
