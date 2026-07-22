import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import type { HealthCheck, HealthResult } from "./types.ts";
import { createOllamaCheck } from "./ollama.ts";
import { createActivityWatchCheck } from "./activity-watch.ts";
import { createFootnoteCheck } from "./footnote.ts";
import { createMcpToolsCheck } from "./mcp-tools.ts";
import { runHealthChecks } from "./runner.ts";
import { formatHealthReport } from "./format.ts";

describe("Health Checks", () => {
  describe("Ollama adapter", () => {
    it("returns ok when Ollama is running", async () => {
      const mockFetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({
          models: [{ name: "llama3.1:8b" }, { name: "qwen2.5:3b" }],
        }),
      }));

      const check = createOllamaCheck({
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const result = await check.check();

      assert.equal(result.status, "ok");
      assert.match(result.message, /2 models/);
      assert.equal((result.details as { modelCount: number }).modelCount, 2);
    });

    it("returns error when Ollama is not running", async () => {
      const mockFetch = mock.fn(async () => {
        throw new Error("ECONNREFUSED");
      });

      const check = createOllamaCheck({
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const result = await check.check();

      assert.equal(result.status, "error");
      assert.equal(result.message, "Not running");
    });

    it("returns error on HTTP error", async () => {
      const mockFetch = mock.fn(async () => ({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      }));

      const check = createOllamaCheck({
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const result = await check.check();

      assert.equal(result.status, "error");
      assert.match(result.message, /500/);
    });
  });

  describe("ActivityWatch adapter", () => {
    it("returns ok when AW is running", async () => {
      const mockFetch = mock.fn(async () => ({
        ok: true,
        json: async () => ({
          hostname: "test-host",
          version: "0.12.0",
          testing: false,
        }),
      }));

      const check = createActivityWatchCheck({
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const result = await check.check();

      assert.equal(result.status, "ok");
      assert.match(result.message, /test-host/);
    });

    it("returns warn when AW is not running", async () => {
      const mockFetch = mock.fn(async () => {
        throw new Error("ECONNREFUSED");
      });

      const check = createActivityWatchCheck({
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const result = await check.check();

      assert.equal(result.status, "warn");
      assert.equal(result.message, "Not running");
    });
  });

  describe("Footnote adapter", () => {
    it("returns ok when all files exist", async () => {
      const mockExists = mock.fn(() => true);

      const check = createFootnoteCheck({
        dbPath: "/test/.footnote",
        existsFn: mockExists,
      });

      const result = await check.check();

      assert.equal(result.status, "ok");
      assert.match(result.message, /ready/);
    });

    it("returns warn when directory missing", async () => {
      const mockExists = mock.fn(() => false);

      const check = createFootnoteCheck({
        dbPath: "/test/.footnote",
        existsFn: mockExists,
      });

      const result = await check.check();

      assert.equal(result.status, "warn");
      assert.match(result.message, /not found/);
    });

    it("returns warn when index files missing", async () => {
      const mockExists = mock.fn((path: string) => {
        if (path === "/test/.footnote") return true;
        if (path.endsWith("index.sqlite")) return false;
        if (path.endsWith("manifest.json")) return true;
        return false;
      });

      const check = createFootnoteCheck({
        dbPath: "/test/.footnote",
        existsFn: mockExists,
      });

      const result = await check.check();

      assert.equal(result.status, "warn");
      assert.match(result.message, /index\.sqlite/);
    });
  });

  describe("MCP Tools adapter", () => {
    it("returns ok when MCP disabled", async () => {
      const originalEnv = process.env.JERRY_MCP_DISABLED;
      process.env.JERRY_MCP_DISABLED = "true";

      try {
        const check = createMcpToolsCheck();
        const result = await check.check();

        assert.equal(result.status, "ok");
        assert.match(result.message, /disabled/);
      } finally {
        if (originalEnv === undefined) {
          delete process.env.JERRY_MCP_DISABLED;
        } else {
          process.env.JERRY_MCP_DISABLED = originalEnv;
        }
      }
    });

    it("returns ok when server connects", async () => {
      const originalEnv = process.env.JERRY_MCP_SERVERS;
      process.env.JERRY_MCP_SERVERS = JSON.stringify([
        { name: "test-server", command: "echo", args: [] },
      ]);

      const mockClient = {
        disconnect: mock.fn(async () => {}),
      };
      const mockCreateClient = mock.fn(async () => mockClient);

      try {
        const check = createMcpToolsCheck({
          createClientFn: mockCreateClient as never,
        });
        const result = await check.check();

        assert.equal(result.status, "ok");
        assert.match(result.message, /1 server.*reachable/);
      } finally {
        if (originalEnv === undefined) {
          delete process.env.JERRY_MCP_SERVERS;
        } else {
          process.env.JERRY_MCP_SERVERS = originalEnv;
        }
      }
    });

    it("returns warn when server fails to connect", async () => {
      const originalEnv = process.env.JERRY_MCP_SERVERS;
      process.env.JERRY_MCP_SERVERS = JSON.stringify([
        { name: "test-server", command: "echo", args: [] },
      ]);

      const mockCreateClient = mock.fn(async () => null);

      try {
        const check = createMcpToolsCheck({
          createClientFn: mockCreateClient as never,
        });
        const result = await check.check();

        assert.equal(result.status, "warn");
        assert.match(result.message, /unreachable/);
      } finally {
        if (originalEnv === undefined) {
          delete process.env.JERRY_MCP_SERVERS;
        } else {
          process.env.JERRY_MCP_SERVERS = originalEnv;
        }
      }
    });
  });

  describe("Runner", () => {
    it("computes overall ok when all checks pass", async () => {
      const checks: HealthCheck[] = [
        {
          name: "Test1",
          description: "Test check 1",
          required: true,
          check: async () => ({ status: "ok", message: "OK" }),
        },
        {
          name: "Test2",
          description: "Test check 2",
          required: false,
          check: async () => ({ status: "ok", message: "OK" }),
        },
      ];

      const report = await runHealthChecks(checks);

      assert.equal(report.overall, "ok");
      assert.equal(report.results.length, 2);
    });

    it("computes overall error when required check fails", async () => {
      const checks: HealthCheck[] = [
        {
          name: "Required",
          description: "Required check",
          required: true,
          check: async () => ({ status: "error", message: "Failed" }),
        },
        {
          name: "Optional",
          description: "Optional check",
          required: false,
          check: async () => ({ status: "ok", message: "OK" }),
        },
      ];

      const report = await runHealthChecks(checks);

      assert.equal(report.overall, "error");
    });

    it("computes overall degraded when optional check fails", async () => {
      const checks: HealthCheck[] = [
        {
          name: "Required",
          description: "Required check",
          required: true,
          check: async () => ({ status: "ok", message: "OK" }),
        },
        {
          name: "Optional",
          description: "Optional check",
          required: false,
          check: async () => ({ status: "warn", message: "Warning" }),
        },
      ];

      const report = await runHealthChecks(checks);

      assert.equal(report.overall, "degraded");
    });

    it("handles timeout", async () => {
      const checks: HealthCheck[] = [
        {
          name: "Slow",
          description: "Slow check",
          required: false,
          check: async () => {
            await new Promise((resolve) => setTimeout(resolve, 5000));
            return { status: "ok", message: "OK" };
          },
        },
      ];

      const report = await runHealthChecks(checks, { timeoutMs: 100 });

      assert.equal(report.results[0].result.status, "error");
      assert.match(report.results[0].result.message, /[Tt]imeout/);
    });

    it("measures latency", async () => {
      const checks: HealthCheck[] = [
        {
          name: "Quick",
          description: "Quick check",
          required: false,
          check: async () => {
            await new Promise((resolve) => setTimeout(resolve, 50));
            return { status: "ok", message: "OK" };
          },
        },
      ];

      const report = await runHealthChecks(checks);

      assert.ok(
        report.results[0].result.latencyMs !== undefined,
        "latencyMs should be set"
      );
      assert.ok(
        report.results[0].result.latencyMs >= 40,
        "latencyMs should be >= 40"
      );
    });
  });

  describe("Formatter", () => {
    it("formats report with status symbols", () => {
      const report = {
        timestamp: new Date("2024-01-01T00:00:00Z"),
        results: [
          {
            check: {
              name: "TestOk",
              description: "Test",
              required: true,
              check: async (): Promise<HealthResult> => ({
                status: "ok",
                message: "OK",
              }),
            },
            result: { status: "ok" as const, message: "All good", latencyMs: 50 },
          },
          {
            check: {
              name: "TestWarn",
              description: "Test",
              required: false,
              check: async (): Promise<HealthResult> => ({
                status: "warn",
                message: "Warn",
              }),
            },
            result: { status: "warn" as const, message: "Warning" },
          },
        ],
        overall: "degraded" as const,
      };

      const output = formatHealthReport(report);

      assert.match(output, /✓.*TestOk/);
      assert.match(output, /⚠.*TestWarn/);
      assert.match(output, /50ms/);
      assert.match(output, /Overall: degraded/);
    });

    it("includes details when present", () => {
      const report = {
        timestamp: new Date(),
        results: [
          {
            check: {
              name: "Test",
              description: "Test",
              required: true,
              check: async (): Promise<HealthResult> => ({
                status: "ok",
                message: "OK",
              }),
            },
            result: {
              status: "ok" as const,
              message: "OK",
              details: { modelCount: 3 },
            },
          },
        ],
        overall: "ok" as const,
      };

      const output = formatHealthReport(report);

      assert.match(output, /modelCount.*3/);
    });
  });
});
