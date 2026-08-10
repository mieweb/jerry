/**
 * Jerry collector CLI entry point.
 *
 * Usage:
 *   jerry-collector [--watch <path>] [--footnote-root <path>] [--jerry-url <url>]
 */

import { createAwPoller } from "./aw-poller.js";
import { createFolderWatcher } from "./folder-watcher.js";
import { createFootnoteIndexer, resolveFootnoteDbPath } from "./footnote-index.js";
import {
  CliUsageError,
  formatHelp,
  parseArgs,
  resolveFootnoteRoot,
  type CliOptions,
} from "./cli-options.js";

async function main() {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof CliUsageError) {
      console.error(err.message);
      console.error("");
      console.error(formatHelp());
      process.exit(1);
    }
    throw err;
  }

  if (options.help) {
    console.log(formatHelp());
    process.exit(0);
  }

  const footnoteRoot = resolveFootnoteRoot(options);

  console.log("Jerry Collector");
  console.log("===============");
  console.log(`AW URL: ${options.awUrl}`);
  console.log(`Jerry URL: ${options.jerryUrl}`);
  console.log(`Poll interval: ${options.pollInterval}ms`);
  console.log(
    `Watch paths: ${
      options.watchPaths.length > 0 ? options.watchPaths.join(", ") : "(none)"
    }`
  );
  if (footnoteRoot) {
    console.log(`Footnote root: ${footnoteRoot}`);
    console.log(`Footnote index: ${resolveFootnoteDbPath()}`);
  } else if (options.footnote && options.watchPaths.length > 1) {
    console.warn(
      "Footnote indexing disabled: several watch paths given but no --footnote-root. " +
        "One index tracks one root."
    );
  }
  console.log(`Backfill existing files: ${options.backfill ? "yes" : "no"}`);
  console.log("");

  // Create AW poller
  const awPoller = createAwPoller({
    awUrl: options.awUrl,
    jerryUrl: options.jerryUrl,
    pollInterval: options.pollInterval,
  });

  const footnoteIndexer = footnoteRoot
    ? createFootnoteIndexer({
        root: footnoteRoot,
        jerryUrl: options.jerryUrl,
        embeddingModel: options.embeddingModel,
      })
    : null;

  // Create folder watcher if paths provided
  const folderWatcher =
    options.watchPaths.length > 0
      ? createFolderWatcher({
          jerryUrl: options.jerryUrl,
          watchPaths: options.watchPaths,
          ingestExisting: options.backfill,
          legacyVectorIngest: options.legacyVectorIngest,
          onIndexable: () => footnoteIndexer?.schedule(),
          onReady: () => {
            if (footnoteIndexer) {
              console.log("Building footnote index...");
              void footnoteIndexer.flush();
            }
          },
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
    await footnoteIndexer?.stop();
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
