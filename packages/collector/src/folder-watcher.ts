/**
 * Folder watcher — watches directories for new files (screenshots, notes).
 *
 * Pushes external events to Jerry when new files are detected,
 * and ingests text files into the semantic search index.
 */

import { watch, type FSWatcher } from "chokidar";
import { readFile, stat } from "fs/promises";
import { basename, extname } from "path";
import { ingestFile, shouldIndex } from "./ingest.js";

export interface FolderWatcherConfig {
  /** Jerry API base URL (default: http://127.0.0.1:8787) */
  jerryUrl?: string;
  /** Directories to watch */
  watchPaths: string[];
  /** File extensions to watch (default: common image/text types) */
  extensions?: string[];
}

const DEFAULT_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".txt",
  ".md",
  ".json",
];

/**
 * Push a file event to Jerry.
 */
async function pushFileEvent(
  jerryUrl: string,
  filePath: string,
  eventType: "created" | "modified"
): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    const ext = extname(filePath).toLowerCase();
    const name = basename(filePath);

    // Determine source type based on extension
    let source: string;
    if ([".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext)) {
      source = "screenshot";
    } else {
      source = "folder";
    }

    // Read file contents for text files (skip large files and binaries)
    let content: string | null = null;
    if ([".txt", ".md", ".json"].includes(ext) && stats.size < 1024 * 100) {
      content = await readFile(filePath, "utf-8");
    }

    const payload = {
      source,
      occurredAt: stats.mtime.toISOString(),
      payload: {
        path: filePath,
        name,
        extension: ext,
        size: stats.size,
        eventType,
        content: content?.slice(0, 10000), // Limit content size
      },
    };

    const response = await fetch(`${jerryUrl}/v1/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([payload]),
    });

    if (!response.ok) {
      console.error(`Failed to push file event: ${response.status}`);
      return false;
    }

    console.log(`Pushed ${eventType} event for: ${name}`);

    // Ingest text files for semantic search indexing
    if (content && shouldIndex(ext, stats.size)) {
      const ingestResult = await ingestFile(filePath, content, { jerryUrl });
      if (ingestResult.success) {
        console.log(`Indexed for search: ${name}`);
      } else if (ingestResult.error) {
        console.warn(`Indexing skipped: ${ingestResult.error}`);
      }
    }

    return true;
  } catch (err) {
    console.error(`Error pushing file event for ${filePath}: ${err}`);
    return false;
  }
}

/**
 * Create and start a folder watcher.
 */
export function createFolderWatcher(config: FolderWatcherConfig) {
  const jerryUrl = config.jerryUrl ?? "http://127.0.0.1:8787";
  const extensions = config.extensions ?? DEFAULT_EXTENSIONS;
  let watcher: FSWatcher | null = null;

  function shouldWatch(path: string): boolean {
    const ext = extname(path).toLowerCase();
    return extensions.includes(ext);
  }

  return {
    start() {
      if (watcher) return;

      if (config.watchPaths.length === 0) {
        console.log("No watch paths configured");
        return;
      }

      console.log(`Starting folder watcher for: ${config.watchPaths.join(", ")}`);

      watcher = watch(config.watchPaths, {
        persistent: true,
        ignoreInitial: true, // Don't emit events for existing files
        awaitWriteFinish: {
          stabilityThreshold: 2000,
          pollInterval: 100,
        },
      });

      watcher.on("add", async (path) => {
        if (shouldWatch(path)) {
          await pushFileEvent(jerryUrl, path, "created");
        }
      });

      watcher.on("change", async (path) => {
        if (shouldWatch(path)) {
          await pushFileEvent(jerryUrl, path, "modified");
        }
      });

      watcher.on("error", (error) => {
        console.error("Folder watcher error:", error);
      });
    },

    async stop() {
      if (watcher) {
        await watcher.close();
        watcher = null;
        console.log("Folder watcher stopped");
      }
    },

    isRunning() {
      return watcher !== null;
    },
  };
}
