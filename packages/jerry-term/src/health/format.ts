/**
 * Health report formatter.
 *
 * Produces plain-text terminal output with status symbols and latencies.
 */

import type { HealthReport, HealthStatus } from "./types.ts";

const STATUS_SYMBOLS: Record<HealthStatus, string> = {
  ok: "✓",
  warn: "⚠",
  error: "✗",
};

const STATUS_COLORS: Record<HealthStatus, string> = {
  ok: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};

const RESET = "\x1b[0m";

function colorize(text: string, status: HealthStatus): string {
  return `${STATUS_COLORS[status]}${text}${RESET}`;
}

export function formatHealthReport(report: HealthReport): string {
  const lines: string[] = [];

  lines.push("Health Check Report");
  lines.push("─".repeat(40));

  for (const entry of report.results) {
    const { check, result } = entry;
    const symbol = STATUS_SYMBOLS[result.status];
    const coloredSymbol = colorize(symbol, result.status);
    const latency = result.latencyMs !== undefined ? ` (${result.latencyMs}ms)` : "";
    const required = check.required ? "" : " [optional]";

    lines.push(`${coloredSymbol} ${check.name}${required}${latency}`);
    lines.push(`  ${result.message}`);

    if (result.details && Object.keys(result.details).length > 0) {
      for (const [key, value] of Object.entries(result.details)) {
        lines.push(`    ${key}: ${JSON.stringify(value)}`);
      }
    }
  }

  lines.push("─".repeat(40));

  const overallStatus =
    report.overall === "ok"
      ? "ok"
      : report.overall === "degraded"
        ? "warn"
        : "error";
  const overallSymbol = STATUS_SYMBOLS[overallStatus as HealthStatus];
  const coloredOverall = colorize(
    `${overallSymbol} Overall: ${report.overall}`,
    overallStatus as HealthStatus
  );
  lines.push(coloredOverall);

  return lines.join("\n");
}
