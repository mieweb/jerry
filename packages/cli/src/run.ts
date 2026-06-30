/**
 * Jerry CLI entry point.
 *
 * This is a thin wrapper around @mieweb/cloud-agent-cli that configures
 * Jerry-specific defaults (agent name, URL, profile).
 */

import { run as agentRun } from "@mieweb/cloud-agent-cli";
import { loadConfig } from "./profile.js";

// Read package.json version (fallback if not found)
const VERSION = "0.1.0";

/**
 * Run the Jerry CLI.
 */
export async function run(): Promise<void> {
  const config = loadConfig();

  await agentRun({
    agent: "jerry",
    baseUrl: config.url,
    profile: config.profile,
    version: VERSION,
  });
}
