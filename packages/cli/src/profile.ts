/**
 * Profile and target resolution for Jerry CLI.
 *
 * Reads configuration from environment and config files to determine
 * the target Jerry server URL and privacy profile.
 */

import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface JerryConfig {
  /** Jerry server URL */
  url: string;
  /** Privacy profile (optional) */
  profile?: {
    runtime?: string;
    model?: string;
    egress?: string;
    /** API key for byo-cloud/ozwell endpoints */
    apiKey?: string;
    /** Ozwell endpoint (defaults to Manager host) */
    endpoint?: string;
  };
}

const DEFAULT_URL = "http://127.0.0.1:8787";

/**
 * Possible config file locations, in order of precedence.
 */
function getConfigPaths(): string[] {
  const home = homedir();
  return [
    join(process.cwd(), ".jerry.json"),
    join(process.cwd(), ".jerry/config.json"),
    join(home, ".config/jerry/config.json"),
    join(home, ".jerry.json"),
  ];
}

/**
 * Try to read a JSON config file.
 */
function readConfigFile(path: string): Partial<JerryConfig> | null {
  try {
    if (!existsSync(path)) return null;
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content) as Partial<JerryConfig>;
  } catch {
    return null;
  }
}

/**
 * Load Jerry configuration from environment and config files.
 */
export function loadConfig(): JerryConfig {
  // Start with defaults
  let config: JerryConfig = {
    url: DEFAULT_URL,
  };

  // Try config files (lowest precedence first)
  const paths = getConfigPaths().reverse();
  for (const path of paths) {
    const fileConfig = readConfigFile(path);
    if (fileConfig) {
      config = { ...config, ...fileConfig };
    }
  }

  // Environment variables (highest precedence)
  if (process.env.JERRY_URL) {
    config.url = process.env.JERRY_URL;
  }

  // Check for any profile-related environment variables
  const hasProfileEnvVars =
    process.env.JERRY_RUNTIME ||
    process.env.JERRY_MODEL ||
    process.env.JERRY_EGRESS ||
    process.env.JERRY_ENDPOINT ||
    process.env.OZWELL_ENDPOINT ||
    process.env.JERRY_API_KEY ||
    process.env.OZWELL_API_KEY ||
    process.env.OZWELL_AGENT_KEY ||
    process.env.OPENAI_API_KEY;

  if (hasProfileEnvVars) {
    // Resolve endpoint: JERRY_ENDPOINT > OZWELL_ENDPOINT > config
    const endpoint =
      process.env.JERRY_ENDPOINT ??
      process.env.OZWELL_ENDPOINT ??
      config.profile?.endpoint;

    // Resolve API key based on runtime
    // For ozwell: OZWELL_API_KEY > OZWELL_AGENT_KEY > JERRY_API_KEY
    //   (parent ozw_ preferred — Jerry owns tools; agnt_key injects Ozwell persona)
    // For byo-cloud: JERRY_API_KEY > OPENAI_API_KEY
    const runtime = process.env.JERRY_RUNTIME ?? config.profile?.runtime;
    let apiKey = config.profile?.apiKey;

    if (runtime === "ozwell") {
      apiKey =
        process.env.OZWELL_API_KEY ??
        process.env.OZWELL_AGENT_KEY ??
        process.env.JERRY_API_KEY ??
        apiKey;
    } else if (runtime === "byo-cloud") {
      apiKey =
        process.env.JERRY_API_KEY ??
        process.env.OPENAI_API_KEY ??
        apiKey;
    } else {
      // For other runtimes, check JERRY_API_KEY
      apiKey = process.env.JERRY_API_KEY ?? apiKey;
    }

    config.profile = {
      ...config.profile,
      runtime: process.env.JERRY_RUNTIME ?? config.profile?.runtime,
      model: process.env.JERRY_MODEL ?? config.profile?.model,
      egress: process.env.JERRY_EGRESS ?? config.profile?.egress,
      endpoint,
      apiKey,
    };
  }

  return config;
}

/**
 * Get the current working directory context.
 * This is sent with requests so the agent knows the user's project context.
 */
export function getCwdContext(): { cwd: string; git?: { root: string; branch?: string } } {
  const cwd = process.cwd();
  const context: ReturnType<typeof getCwdContext> = { cwd };

  // Check if we're in a git repo
  try {
    let dir = cwd;
    while (dir !== "/") {
      if (existsSync(join(dir, ".git"))) {
        context.git = { root: dir };

        // Try to read current branch
        const headPath = join(dir, ".git/HEAD");
        if (existsSync(headPath)) {
          const head = readFileSync(headPath, "utf-8").trim();
          const branchMatch = head.match(/^ref: refs\/heads\/(.+)$/);
          if (branchMatch) {
            context.git.branch = branchMatch[1];
          }
        }
        break;
      }
      dir = join(dir, "..");
    }
  } catch {
    // Ignore errors reading git info
  }

  return context;
}
