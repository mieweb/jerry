/**
 * MCP configuration resolver.
 *
 * Resolves MCP server configs from privacy profiles and environment overrides.
 * Provides default footnote configuration when available.
 */

import type { McpServerConfig, PrivacyProfile } from "@mieweb/jerry-agent-runtime";
import { resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve FOOTNOTE_DB to an absolute path (expands ~).
 */
export function resolveFootnoteDbPath(): string {
  const raw = process.env.FOOTNOTE_DB || "./.footnote";
  if (raw.startsWith("~/")) {
    return resolve(homedir(), raw.slice(2));
  }
  return resolve(raw);
}

/**
 * Default footnote MCP server configuration.
 * Points to the vendor/footnote submodule's docidx CLI.
 */
export function getDefaultFootnoteConfig(): McpServerConfig {
  const footnoteRoot = resolve(__dirname, "../../../vendor/footnote");
  const dbPath = resolveFootnoteDbPath();
  return {
    name: "footnote",
    command: "node",
    args: [
      resolve(footnoteRoot, "bin/docidx.js"),
      "mcp",
      "--db",
      dbPath,
    ],
    env: {
      FOOTNOTE_DB: dbPath,
    },
  };
}

/**
 * Resolve MCP server configurations from profile and environment.
 *
 * Priority:
 * 1. Profile mcp.servers[] if provided
 * 2. JERRY_MCP_SERVERS env var (JSON array)
 * 3. Default footnote if JERRY_FOOTNOTE_ENABLED=true or not explicitly disabled
 *
 * @param profile - Privacy profile (may contain mcp.servers)
 * @returns Array of MCP server configs to connect
 */
export function resolveMcpServers(
  profile?: PrivacyProfile
): McpServerConfig[] {
  // Check for explicit profile config
  if (profile?.mcp?.servers && profile.mcp.servers.length > 0) {
    return profile.mcp.servers;
  }

  // Check for environment override
  const envServers = process.env.JERRY_MCP_SERVERS;
  if (envServers) {
    try {
      const parsed = JSON.parse(envServers);
      if (Array.isArray(parsed)) {
        return parsed as McpServerConfig[];
      }
    } catch {
      console.warn("Invalid JERRY_MCP_SERVERS JSON, ignoring");
    }
  }

  // Default: include footnote unless explicitly disabled
  const footnoteDisabled =
    process.env.JERRY_FOOTNOTE_ENABLED === "false" ||
    process.env.JERRY_MCP_DISABLED === "true";

  if (!footnoteDisabled) {
    return [getDefaultFootnoteConfig()];
  }

  return [];
}

/**
 * Check if MCP is available for the current environment.
 * MCP requires stdio transport which needs process spawning capability.
 */
export function isMcpAvailable(): boolean {
  // Cloudflare Workers expose caches but cannot spawn child processes
  const hasCaches = "caches" in globalThis;
  const hasProcess = typeof process !== "undefined";
  if (hasCaches && !hasProcess) {
    return false;
  }
  return true;
}
