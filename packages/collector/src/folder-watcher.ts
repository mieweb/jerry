/**
 * Folder watcher — watches directories for files (screenshots, notes, docs).
 *
 * Pushes external events to Jerry when files are detected, uploads text content
 * to the bucket so read_file can resolve it, and signals the footnote indexer
 * that the corpus changed. Files already present when the watcher starts are
 * ingested too, so a folder does not have to be touched to become searchable.
 */

import { watch, type FSWatcher } from "chokidar";
import { readFile, stat } from "fs/promises";
import { basename, extname, sep } from "path";
import { ingestFile, isFootnoteIndexable, shouldIndex } from "./ingest.js";

export interface FolderWatcherConfig {
  /** Jerry API base URL (default: http://127.0.0.1:8787) */
  jerryUrl?: string;
  /** Directories to watch */
  watchPaths: string[];
  /** File extensions to watch (default: common image/text/document types) */
  extensions?: string[];
  /** Ingest files that already exist when the watcher starts (default: true) */
  ingestExisting?: boolean;
  /** Extra directory names to skip, merged with the defaults */
  ignoredNames?: string[];
  /** Embed text files into the VECTORS store via POST /v1/index (default: false) */
  legacyVectorIngest?: boolean;
  /** Called after each footnote-indexable file is pushed */
  onIndexable?: (path: string) => void;
  /** Called once the initial scan finishes, with the number of files seen */
  onReady?: (initialCount: number) => void;
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
  ".pdf",
  ".docx",
  ".xml",
];

const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
const TEXT_EXTENSIONS = [".txt", ".md", ".json", ".xml"];

/**
 * Directories that must never be traversed. Watching a repository root without
 * these produces EMFILE (too many open files) within seconds.
 */
const DEFAULT_IGNORED_NAMES = [
  "node_modules",
  ".git",
  ".data",
  ".footnote",
  ".cache",
  ".next",
  ".turbo",
  "dist",
  "build",
  "coverage",
  ".DS_Store",
];

/**
 * Build a chokidar v4 ignore predicate. v4 dropped glob support, so matching is
 * done on path segments instead of patterns.
 */
export function createIgnoreMatcher(
  extraNames: string[] = []
): (targetPath: string) => boolean {
  const ignored = new Set([...DEFAULT_IGNORED_NAMES, ...extraNames]);
  return (targetPath: string) =>
    targetPath.split(sep).some((segment) => ignored.has(segment));
}

/**
 * Push a file event to Jerry.
 */
async function pushFileEvent(
  jerryUrl: string,
  filePath: string,
  eventType: "created" | "modified",
  options: { legacyVectorIngest: boolean; quiet: boolean }
): Promise<boolean> {
  try {
    const stats = await stat(filePath);
    const ext = extname(filePath).toLowerCase();
    const name = basename(filePath);

    const source = IMAGE_EXTENSIONS.includes(ext) ? "screenshot" : "folder";

    // Read file contents for text files (skip large files and binaries)
    let content: string | null = null;
    if (TEXT_EXTENSIONS.includes(ext) && stats.size < 1024 * 100) {
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

    if (!options.quiet) {
      console.log(`Pushed ${eventType} event for: ${name}`);
    }

    // Upload to the bucket so read_file resolves this path. Vector indexing is
    // opt-in because footnote owns the searchable index.
    if (content && shouldIndex(ext, stats.size)) {
      const ingestResult = await ingestFile(filePath, content, {
        jerryUrl,
        index: options.legacyVectorIngest,
      });
      if (!ingestResult.success && ingestResult.error) {
        console.warn(`Ingest skipped for ${name}: ${ingestResult.error}`);
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
  const ingestExisting = config.ingestExisting ?? true;
  const legacyVectorIngest = config.legacyVectorIngest ?? false;
  const isIgnored = createIgnoreMatcher(config.ignoredNames);
  let watcher: FSWatcher | null = null;
  let ready = false;
  let initialCount = 0;
  // Serialise pushes: the backfill scan can fire hundreds of adds at once.
  let queue: Promise<void> = Promise.resolve();

  function shouldWatch(path: string): boolean {
    const ext = extname(path).toLowerCase();
    return extensions.includes(ext);
  }

  async function handleFile(
    path: string,
    eventType: "created" | "modified"
  ): Promise<void> {
    if (!shouldWatch(path)) return;

    if (!ready) initialCount++;

    // The backfill scan can cover hundreds of files; log a summary instead.
    await pushFileEvent(jerryUrl, path, eventType, {
      legacyVectorIngest,
      quiet: !ready,
    });

    if (isFootnoteIndexable(extname(path))) {
      config.onIndexable?.(path);
    }
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
        ignoreInitial: !ingestExisting,
        ignored: (targetPath) => isIgnored(targetPath),
        awaitWriteFinish: {
          stabilityThreshold: 2000,
          pollInterval: 100,
        },
      });

      watcher.on("add", (path) => {
        queue = queue.then(() => handleFile(path, "created"));
      });

      watcher.on("change", (path) => {
        queue = queue.then(() => handleFile(path, "modified"));
      });

      watcher.on("ready", () => {
        // Let the queued backfill pushes drain before reporting the count.
        queue = queue.then(() => {
          ready = true;
          if (ingestExisting) {
            console.log(
              `Initial scan complete: ${initialCount} existing file(s) ingested`
            );
          }
          config.onReady?.(initialCount);
        });
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
