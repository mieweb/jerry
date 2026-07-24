/**
 * Health check runner.
 *
 * Executes all health checks in parallel with timeout support.
 */

import type {
  HealthCheck,
  HealthReport,
  HealthReportEntry,
  HealthResult,
} from "./types.ts";

export interface RunnerOptions {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 3000;

async function runWithTimeout(
  check: HealthCheck,
  timeoutMs: number
): Promise<HealthResult> {
  const controller = new AbortController();

  const checkPromise = (async (): Promise<HealthResult> => {
    const start = performance.now();
    try {
      const result = await check.check({ signal: controller.signal });
      const latencyMs = Math.round(performance.now() - start);
      return { ...result, latencyMs };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw error;
      }
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  })();

  const timeoutPromise = new Promise<HealthResult>((_, reject) => {
    setTimeout(() => {
      controller.abort();
      reject(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([checkPromise, timeoutPromise]);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Timeout",
    };
  }
}

function computeOverall(
  entries: HealthReportEntry[]
): "ok" | "degraded" | "error" {
  const hasRequiredError = entries.some(
    (e) => e.check.required && e.result.status === "error"
  );
  if (hasRequiredError) {
    return "error";
  }

  const hasAnyIssue = entries.some((e) => e.result.status !== "ok");
  if (hasAnyIssue) {
    return "degraded";
  }

  return "ok";
}

export async function runHealthChecks(
  checks: HealthCheck[],
  options?: RunnerOptions
): Promise<HealthReport> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const results = await Promise.all(
    checks.map(async (check): Promise<HealthReportEntry> => {
      const result = await runWithTimeout(check, timeoutMs);
      return { check, result };
    })
  );

  return {
    timestamp: new Date(),
    results,
    overall: computeOverall(results),
  };
}
