/**
 * MCP tools health check adapter.
 *
 * Verifies configured MCP servers are reachable by attempting connection.
 */

import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import type { McpServerConfig } from "@mieweb/jerry-agent-runtime";
import { McpClient } from "@mieweb/jerry-tools/mcp";
import type { HealthCheck, HealthResult } from "./types.ts";

export interface McpToolsCheckOptions {
  existsFn?: (path: string) => boolean;
  createClientFn?: (config: McpServerConfig) => Promise<McpClient | null>;
}

function resolveFootnoteDbPath(): string {
  const raw = process.env.FOOTNOTE_DB ?? "./.footnote";
  if (raw.startsWith("~/")) {
    return resolve(homedir(), raw.slice(2));
  }
  return resolve(raw);
}

function findMonorepoRoot(startDir: string): string | null {
  let current = startDir;
  const root = resolve("/");

  while (current !== root) {
    const vendorPath = resolve(current, "vendor/footnote/bin/docidx.js");
    if (existsSync(vendorPath)) {
      return current;
    }
    current = dirname(current);
  }
  return null;
}

function getDefaultFootnoteConfig(): McpServerConfig | null {
  const monorepoRoot = findMonorepoRoot(process.cwd());
  if (!monorepoRoot) {
    return null;
  }

  const docidxPath = resolve(monorepoRoot, "vendor/footnote/bin/docidx.js");
  const dbPath = resolveFootnoteDbPath();

  return {
    name: "footnote",
    command: "node",
    args: [docidxPath, "mcp", "--db", dbPath],
    env: { FOOTNOTE_DB: dbPath },
  };
}

function resolveMcpServers(): McpServerConfig[] {
  const envServers = process.env.JERRY_MCP_SERVERS;
  if (envServers) {
    try {
      const parsed = JSON.parse(envServers);
      if (Array.isArray(parsed)) {
        return parsed as McpServerConfig[];
      }
    } catch {
      // Invalid JSON, fall through to default
    }
  }

  const footnoteDisabled =
    process.env.JERRY_FOOTNOTE_ENABLED === "false" ||
    process.env.JERRY_MCP_DISABLED === "true";

  if (!footnoteDisabled) {
    const config = getDefaultFootnoteConfig();
    if (config) {
      return [config];
    }
  }

  return [];
}

async function defaultCreateClient(
  config: McpServerConfig
): Promise<McpClient | null> {
  const client = new McpClient(config);
  try {
    await client.connect();
    return client;
  } catch {
    return null;
  }
}

export function createMcpToolsCheck(opts?: McpToolsCheckOptions): HealthCheck {
  const createClientFn = opts?.createClientFn ?? defaultCreateClient;

  return {
    name: "MCP Tools",
    description: "Model Context Protocol servers",
    required: false,

    async check(): Promise<HealthResult> {
      if (process.env.JERRY_MCP_DISABLED === "true") {
        return {
          status: "ok",
          message: "MCP disabled by JERRY_MCP_DISABLED",
          details: { disabled: true },
        };
      }

      const servers = resolveMcpServers();

      if (servers.length === 0) {
        const monorepoRoot = findMonorepoRoot(process.cwd());
        if (!monorepoRoot) {
          return {
            status: "warn",
            message: "Footnote MCP binary not found in monorepo",
            details: { serversConfigured: 0, footnoteFound: false },
          };
        }
        return {
          status: "warn",
          message: "No MCP servers configured",
          details: { serversConfigured: 0 },
        };
      }

      const results: Array<{ name: string; connected: boolean }> = [];

      for (const config of servers) {
        const client = await createClientFn(config);
        if (client) {
          results.push({ name: config.name, connected: true });
          await client.disconnect();
        } else {
          results.push({ name: config.name, connected: false });
        }
      }

      const allConnected = results.every((r) => r.connected);
      const noneConnected = results.every((r) => !r.connected);
      const connectedCount = results.filter((r) => r.connected).length;

      if (allConnected) {
        return {
          status: "ok",
          message: `${results.length} server${results.length !== 1 ? "s" : ""} reachable`,
          details: { servers: results },
        };
      }

      if (noneConnected) {
        return {
          status: "warn",
          message: `All ${results.length} server${results.length !== 1 ? "s" : ""} unreachable`,
          details: { servers: results },
        };
      }

      return {
        status: "warn",
        message: `${connectedCount}/${results.length} servers reachable`,
        details: { servers: results },
      };
    },
  };
}
