/**
 * Jerry collector CLI entry point.
 *
 * Usage:
 *   jerry-collector [--watch <path>] [--aw-url <url>] [--jerry-url <url>]
 */

import { createAwPoller } from "./aw-poller.js";
import { createFolderWatcher } from "./folder-watcher.js";

interface CliOptions {
  watchPaths: string[];
  awUrl: string;
  jerryUrl: string;
  pollInterval: number;
  /** Hours of AW history to pull on the first poll (seeds Jerry's DB). */
  lookbackHours: number;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    watchPaths: [],
    awUrl: process.env.AW_URL ?? "http://localhost:5600",
    jerryUrl: process.env.JERRY_URL ?? "http://127.0.0.1:8787",
    pollInterval: parseInt(process.env.POLL_INTERVAL ?? "30000", 10),
    lookbackHours: parseInt(process.env.LOOKBACK_HOURS ?? "48", 10),
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--watch" || arg === "-w") {
      const path = args[++i];
      if (path) options.watchPaths.push(path);
    } else if (arg === "--aw-url") {
      options.awUrl = args[++i] ?? options.awUrl;
    } else if (arg === "--jerry-url") {
      options.jerryUrl = args[++i] ?? options.jerryUrl;
    } else if (arg === "--poll-interval") {
      options.pollInterval = parseInt(args[++i] ?? "30000", 10);
    } else if (arg === "--lookback-hours") {
      options.lookbackHours = parseInt(args[++i] ?? "48", 10);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
jerry-collector — Local sidecar that pushes activity data to Jerry

Usage:
  jerry-collector [options]

Options:
  -w, --watch <path>       Directory to watch for files (can be repeated)
  --aw-url <url>           ActivityWatch API URL (default: http://localhost:5600)
  --jerry-url <url>        Jerry API URL (default: http://127.0.0.1:8787)
  --poll-interval <ms>     AW poll interval in milliseconds (default: 30000)
  --lookback-hours <n>     Hours of AW history on first poll (default: 48)
  -h, --help               Show this help

Environment variables:
  AW_URL                   ActivityWatch API URL
  JERRY_URL                Jerry API URL
  POLL_INTERVAL            AW poll interval in milliseconds
  LOOKBACK_HOURS           Hours of AW history on first poll

Note:
  summarize_activity can also fetch any historical range live from ActivityWatch;
  --lookback-hours only seeds Jerry's local store for offline/fast queries.

Examples:
  jerry-collector
  jerry-collector --watch ~/Screenshots --watch ~/Notes
  jerry-collector --lookback-hours 168
  jerry-collector --jerry-url http://localhost:8787
`.trim());
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log("Jerry Collector");
  console.log("===============");
  console.log(`AW URL: ${options.awUrl}`);
  console.log(`Jerry URL: ${options.jerryUrl}`);
  console.log(`Poll interval: ${options.pollInterval}ms`);
  console.log(`Initial lookback: ${options.lookbackHours}h`);
  if (options.watchPaths.length > 0) {
    console.log(`Watch paths: ${options.watchPaths.join(", ")}`);
  }
  console.log("");

  // Create AW poller
  const awPoller = createAwPoller({
    awUrl: options.awUrl,
    jerryUrl: options.jerryUrl,
    pollInterval: options.pollInterval,
    initialLookbackMs: options.lookbackHours * 60 * 60 * 1000,
  });

  // Create folder watcher if paths provided
  const folderWatcher =
    options.watchPaths.length > 0
      ? createFolderWatcher({
          jerryUrl: options.jerryUrl,
          watchPaths: options.watchPaths,
        })
      : null;

  // Start services
  awPoller.start();
  folderWatcher?.start();

  // Handle shutdown
  const shutdown = async () => {
    console.log("\nShutting down...");
    awPoller.stop();
    await folderWatcher?.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep process running
  console.log("Collector running. Press Ctrl+C to stop.\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
