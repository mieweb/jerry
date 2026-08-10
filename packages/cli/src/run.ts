/**
 * Jerry CLI entry point.
 *
 * Thin wrapper around @mieweb/cloud-agent-cli with Jerry defaults, repo `.env`
 * loading, and `--approve` one-shot for Drive/YouTube ask tools.
 */

import { run as agentRun } from "@mieweb/cloud-agent-cli";
import { loadConfig } from "./profile.js";
import { loadDotEnv } from "./load-env.js";
import { extractApproveFlag, runWithApprove } from "./approve.js";

const VERSION = "0.1.0";

/**
 * Run the Jerry CLI.
 */
export async function run(): Promise<void> {
  loadDotEnv();

  const rawArgs = process.argv.slice(2);

  // `jerry mcp` starts the stdio MCP server instead of the message CLI.
  if (rawArgs[0] === "mcp") {
    const { startMcpServer } = await import("./mcp-server.js");
    await startMcpServer();
    return;
  }

  const { approve, rest } = extractApproveFlag(rawArgs);
  const config = loadConfig();

  if (approve) {
    await runWithApprove(
      {
        agent: "jerry",
        baseUrl: config.url,
        profile: config.profile,
        version: VERSION,
      },
      rest
    );
    return;
  }

  // cloud-agent-cli re-reads process.argv — keep it free of Jerry-only flags.
  process.argv = [process.argv[0]!, process.argv[1]!, ...rest];

  await agentRun({
    agent: "jerry",
    baseUrl: config.url,
    profile: config.profile,
    version: VERSION,
  });
}
