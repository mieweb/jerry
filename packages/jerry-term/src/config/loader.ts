/**
 * Configuration loader for jerry-term.
 *
 * Reads configuration from environment and config files.
 * Priority: env vars > config file > defaults
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RuntimeKind } from "@mieweb/jerry-agent-runtime";
import type { TermConfig, TermConfigFile } from "./types.ts";

const DEFAULT_CONFIG: TermConfig = {
  runtime: "local",
  model: "ollama:llama3.1:8b",
};

function getConfigPaths(): string[] {
  const home = homedir();
  return [
    join(process.cwd(), ".jerry-term.json"),
    join(home, ".config/jerry-term/config.json"),
    join(home, ".jerry-term.json"),
  ];
}

function readConfigFile(path: string): TermConfigFile | null {
  try {
    if (!existsSync(path)) return null;
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content) as TermConfigFile;
  } catch {
    return null;
  }
}

function isValidRuntime(value: string): value is RuntimeKind {
  return ["local", "ozwell", "byo-cloud"].includes(value);
}

export function loadTermConfig(): TermConfig {
  let config: TermConfig = { ...DEFAULT_CONFIG };

  // Try config files (lowest precedence first, so later ones override)
  const paths = getConfigPaths().reverse();
  for (const path of paths) {
    const fileConfig = readConfigFile(path);
    if (fileConfig) {
      if (fileConfig.runtime && isValidRuntime(fileConfig.runtime)) {
        config.runtime = fileConfig.runtime;
      }
      if (fileConfig.model) {
        config.model = fileConfig.model;
      }
      if (fileConfig.apiKey) {
        config.apiKey = fileConfig.apiKey;
      }
      if (fileConfig.endpoint) {
        config.endpoint = fileConfig.endpoint;
      }
      if (fileConfig.egress) {
        config.egress = fileConfig.egress;
      }
    }
  }

  // Environment variables (highest precedence)
  if (process.env.JERRY_RUNTIME && isValidRuntime(process.env.JERRY_RUNTIME)) {
    config.runtime = process.env.JERRY_RUNTIME;
  }

  if (process.env.JERRY_MODEL) {
    config.model = process.env.JERRY_MODEL;
  }

  if (process.env.JERRY_EGRESS) {
    config.egress = process.env.JERRY_EGRESS;
  }

  // Resolve endpoint
  config.endpoint =
    process.env.JERRY_ENDPOINT ??
    process.env.OZWELL_ENDPOINT ??
    config.endpoint;

  // Resolve API key based on runtime
  if (config.runtime === "ozwell") {
    config.apiKey =
      process.env.OZWELL_API_KEY ??
      process.env.OZWELL_AGENT_KEY ??
      process.env.JERRY_API_KEY ??
      config.apiKey;
  } else if (config.runtime === "byo-cloud") {
    config.apiKey =
      process.env.JERRY_API_KEY ??
      process.env.OPENAI_API_KEY ??
      config.apiKey;
  } else {
    config.apiKey = process.env.JERRY_API_KEY ?? config.apiKey;
  }

  return config;
}
