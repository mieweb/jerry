/**
 * Jerry CLI entry point.
 *
 * This is a thin wrapper around @mieweb/cloud-agent-cli that configures
 * Jerry-specific defaults (agent name, URL, profile), plus routing into the
 * interactive session mode (see ./repl.ts).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { run as agentRun } from "@mieweb/cloud-agent-cli";
import { isGreeting } from "./greeting.js";
import { loadEnv } from "./load-env.js";
import { loadConfig } from "./profile.js";

/**
 * How a given argv should be handled.
 */
export type Entry =
  | { kind: "mcp" }
  | { kind: "repl"; sessionId?: string }
  | { kind: "one-shot" };

/**
 * Decide between the MCP server, the interactive REPL, and the one-shot path.
 * Anything not explicitly claimed here stays on the one-shot path so existing
 * scripted usage is unchanged.
 */
export function resolveEntry(
  args: string[],
  env: NodeJS.ProcessEnv = process.env
): Entry {
  if (args[0] === "mcp") return { kind: "mcp" };

  const envSession = env.JERRY_SESSION || undefined;

  // Bare `jerry` opens a conversation; `jerry --help` still prints help.
  if (args.length === 0) return { kind: "repl", sessionId: envSession };

  const first = args[0];

  // `--session <id>` alone resumes in the REPL; with a message it is one-shot.
  if (first === "-s" || first === "--session") {
    const [sessionId, ...rest] = args.slice(1);
    if (sessionId && rest.length === 0) return { kind: "repl", sessionId };
    return { kind: "one-shot" };
  }

  // Every other flag (--help, --version, -txt, --debug, …) is meta or one-shot.
  if (first.startsWith("-")) return { kind: "one-shot" };

  if (isGreeting(args.join(" "))) return { kind: "repl", sessionId: envSession };

  return { kind: "one-shot" };
}

/**
 * Version comes from package.json so there is a single source of truth.
 */
function readVersion(): string {
  try {
    const pkgPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "../package.json"
    );
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Run the Jerry CLI.
 */
export async function run(): Promise<void> {
  loadEnv();
  const args = process.argv.slice(2);
  const entry = resolveEntry(args);

  if (entry.kind === "mcp") {
    const { startMcpServer } = await import("./mcp-server.js");
    await startMcpServer();
    return;
  }

  if (entry.kind === "repl") {
    const { startRepl } = await import("./repl.js");
    await startRepl({ sessionId: entry.sessionId });
    return;
  }

  const config = loadConfig();

  await agentRun({
    agent: "jerry",
    baseUrl: config.url,
    profile: config.profile,
    version: readVersion(),
  });
}
