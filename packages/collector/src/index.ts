export const PACKAGE = "@mieweb/jerry-collector";

export { createAwPoller, type AwPollerConfig } from "./aw-poller.js";
export { createFolderWatcher, type FolderWatcherConfig } from "./folder-watcher.js";
export { ingestFile, shouldIndex, type IngestConfig, type IngestResult } from "./ingest.js";
