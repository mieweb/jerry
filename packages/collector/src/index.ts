export const PACKAGE = "@mieweb/jerry-collector";

export { createAwPoller, type AwPollerConfig } from "./aw-poller.js";
export {
  createFolderWatcher,
  createIgnoreMatcher,
  type FolderWatcherConfig,
} from "./folder-watcher.js";
export {
  ingestFile,
  shouldIndex,
  isFootnoteIndexable,
  FOOTNOTE_EXTENSIONS,
  type IngestConfig,
  type IngestResult,
} from "./ingest.js";
export {
  createFootnoteIndexer,
  resolveFootnoteDbPath,
  resolveDocidxPath,
  type FootnoteIndexer,
  type FootnoteIndexerConfig,
  type BuildOutcome,
  type BuildRunner,
} from "./footnote-index.js";
export {
  parseArgs,
  resolveFootnoteRoot,
  formatHelp,
  CliUsageError,
  type CliOptions,
} from "./cli-options.js";
