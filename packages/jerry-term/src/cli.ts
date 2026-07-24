/**
 * CLI argument parsing and entry point for jerry-term.
 */

import { parseArgs } from "node:util";
import type { RuntimeKind } from "@mieweb/jerry-agent-runtime";
import { JerryBridge } from "./bridge/index.ts";
import {
  createDefaultChecks,
  runHealthChecks,
  formatHealthReport,
} from "./health/index.ts";
import { loadTermConfig, termConfigToProfile } from "./config/index.ts";
import { createDefaultRegistry } from "./commands/index.ts";
import { Repl } from "./repl/index.ts";

export const VERSION = "0.1.0";

const VALID_RUNTIMES: RuntimeKind[] = ["local", "ozwell", "byo-cloud", "anthropic"];

export interface CliOptions {
  version: boolean;
  help: boolean;
  runtime?: RuntimeKind;
  model?: string;
  health: boolean;
  verbose: boolean;
  noUi: boolean;
  config?: string;
  message?: string;
}

const HELP_TEXT = `jerry-term v${VERSION}

Interactive terminal CLI for Jerry AI agent with rich OpenTUI interface.

Usage:
  jerry-term [options] [message]

Options:
  -v, --version          Show version
  -h, --help             Show help
  -r, --runtime <kind>   Set initial runtime (local|ozwell|byo-cloud|anthropic)
  --model <id>           Set initial model for the chosen runtime
  -H, --health           Run health diagnostics and exit
  --verbose              Enable debug output
  --no-ui                Use basic REPL instead of OpenTUI UI
  --config <path>        Custom config file path

Examples:
  jerry-term                          Start interactive REPL
  jerry-term "summarize my day"       One-shot query
  jerry-term -r ozwell                Start with Ozwell runtime
  jerry-term -r anthropic --model claude-sonnet-4-20250514
  jerry-term --health                 Diagnostics only
  jerry-term --no-ui                  Basic mode (no OpenTUI)

Environment:
  JERRY_RUNTIME          Default runtime (local|ozwell|byo-cloud|anthropic)
  JERRY_MODEL            Default model
  JERRY_TERM_CONFIG      Custom config file path
  OZWELL_API_KEY         API key for Ozwell runtime
  ANTHROPIC_API_KEY      API key for Anthropic runtime
  OPENAI_API_KEY         API key for OpenAI BYO runtime
`;

export function parseCliArgs(argv: string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      version: { type: "boolean", short: "v", default: false },
      help: { type: "boolean", short: "h", default: false },
      runtime: { type: "string", short: "r" },
      model: { type: "string" },
      health: { type: "boolean", short: "H", default: false },
      verbose: { type: "boolean", default: false },
      "no-ui": { type: "boolean", default: false },
      config: { type: "string" },
    },
    allowPositionals: true,
    strict: true,
  });

  let runtime: RuntimeKind | undefined;
  if (values.runtime) {
    if (VALID_RUNTIMES.includes(values.runtime as RuntimeKind)) {
      runtime = values.runtime as RuntimeKind;
    } else {
      console.error(
        `Invalid runtime: "${values.runtime}". Valid options: ${VALID_RUNTIMES.join(", ")}`
      );
      process.exit(1);
    }
  }

  return {
    version: values.version ?? false,
    help: values.help ?? false,
    runtime,
    model: values.model,
    health: values.health ?? false,
    verbose: values.verbose ?? false,
    noUi: values["no-ui"] ?? false,
    config: values.config,
    message: positionals.length > 0 ? positionals.join(" ") : undefined,
  };
}

export async function runHealth(): Promise<number> {
  const checks = createDefaultChecks();
  const report = await runHealthChecks(checks);
  console.log(formatHealthReport(report));
  return report.overall === "error" ? 1 : 0;
}

/**
 * Run a one-shot query: execute a single turn and print the result.
 */
async function runOneShot(
  bridge: JerryBridge,
  message: string,
  verbose: boolean
): Promise<void> {
  if (verbose) {
    console.error(`[verbose] Running one-shot query: "${message}"`);
  }

  let output = "";

  const input = {
    messages: [{ role: "user" as const, content: message }],
  };

  for await (const event of bridge.runTurn(input)) {
    if (event.type === "text-delta") {
      output += event.text;
      process.stdout.write(event.text);
    } else if (event.type === "error") {
      console.error(`\nError: ${event.message}`);
      process.exit(1);
    } else if (verbose) {
      if (event.type === "tool-call") {
        console.error(`[verbose] Tool call: ${event.toolName}`);
      } else if (event.type === "tool-result") {
        console.error(`[verbose] Tool result: ${event.toolName}`);
      }
    }
  }

  if (output && !output.endsWith("\n")) {
    console.log();
  }
}

export async function run(argv: string[]): Promise<void> {
  const options = parseCliArgs(argv);

  if (options.version) {
    console.log(`jerry-term v${VERSION}`);
    return;
  }

  if (options.help) {
    console.log(HELP_TEXT);
    return;
  }

  if (options.health) {
    const code = await runHealth();
    process.exit(code);
  }

  // Set config path override if provided
  if (options.config) {
    process.env.JERRY_TERM_CONFIG = options.config;
  }

  // Load config and apply CLI overrides
  const config = loadTermConfig();

  if (options.runtime) {
    config.runtime = options.runtime;
  }

  if (options.model) {
    config.model = options.model;
  }

  const bridge = new JerryBridge(termConfigToProfile(config));
  const registry = createDefaultRegistry();

  // One-shot mode: run query and exit
  if (options.message) {
    await runOneShot(bridge, options.message, options.verbose);
    return;
  }

  // Interactive mode
  if (options.noUi) {
    const repl = new Repl(bridge, config, registry);
    await repl.start();
  } else {
    const { startUi } = await import("./ui/index.tsx");
    await startUi({ bridge, config, registry });
  }
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("/jerry-term/src/cli.ts");

if (isMain) {
  run(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
