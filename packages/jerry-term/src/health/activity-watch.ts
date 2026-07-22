/**
 * ActivityWatch health check adapter.
 *
 * Probes the ActivityWatch API to verify it's running.
 */

import type { HealthCheck, HealthCheckOptions, HealthResult } from "./types.ts";

const DEFAULT_AW_URL = "http://127.0.0.1:5600";

interface AwInfoResponse {
  hostname?: string;
  version?: string;
  testing?: boolean;
}

export interface ActivityWatchCheckOptions {
  awUrl?: string;
  fetchFn?: typeof fetch;
}

export function createActivityWatchCheck(
  opts?: ActivityWatchCheckOptions
): HealthCheck {
  const awUrl = opts?.awUrl ?? process.env.AW_URL ?? DEFAULT_AW_URL;
  const fetchFn = opts?.fetchFn ?? fetch;

  return {
    name: "ActivityWatch",
    description: "Desktop activity tracker",
    required: false,

    async check(options?: HealthCheckOptions): Promise<HealthResult> {
      try {
        const response = await fetchFn(`${awUrl}/api/0/info`, {
          signal: options?.signal,
        });

        if (!response.ok) {
          return {
            status: "warn",
            message: `HTTP ${response.status}: ${response.statusText}`,
          };
        }

        const data = (await response.json()) as AwInfoResponse;

        return {
          status: "ok",
          message: `Running on ${data.hostname ?? "unknown"}`,
          details: {
            hostname: data.hostname,
            version: data.version,
            testing: data.testing,
          },
        };
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }
        return {
          status: "warn",
          message: "Not running",
          details: {
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
    },
  };
}
