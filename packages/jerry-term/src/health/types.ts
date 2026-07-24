/**
 * Health check types for jerry-term.
 *
 * Defines the interface for health check adapters and the report format.
 */

export interface HealthCheck {
  name: string;
  description: string;
  required: boolean;
  check(options?: HealthCheckOptions): Promise<HealthResult>;
}

export interface HealthCheckOptions {
  signal?: AbortSignal;
}

export type HealthStatus = "ok" | "warn" | "error";

export interface HealthResult {
  status: HealthStatus;
  message: string;
  details?: Record<string, unknown>;
  latencyMs?: number;
}

export interface HealthReportEntry {
  check: HealthCheck;
  result: HealthResult;
}

export interface HealthReport {
  timestamp: Date;
  results: HealthReportEntry[];
  overall: "ok" | "degraded" | "error";
}
