/**
 * Footnote indexer — keeps a docidx index in sync with a watched folder.
 *
 * Builds are debounced so a burst of file events produces one rebuild, and
 * serialised because footnote opens its sqlite index without WAL and has no
 * app-level locking. Rebuilds are incremental: docidx skips files whose content
 * hash is unchanged, so re-running over a whole tree is cheap.
 */

import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Result of a single docidx invocation. */
export interface BuildOutcome {
  ok: boolean;
  output?: string;
  error?: string;
}

/** Runs docidx with the given arguments. Injectable so tests avoid spawning. */
export type BuildRunner = (args: string[]) => Promise<BuildOutcome>;

export interface FootnoteIndexerConfig {
  /** Directory to index. Footnote prunes anything outside this root. */
  root: string;
  /** Index output directory (default: $FOOTNOTE_DB or ./.footnote) */
  dbPath?: string;
  /** Embedding model passed to docidx (default: ollama:nomic-embed-text) */
  embeddingModel?: string;
  /** Quiet period before a build starts, in ms (default: 3000) */
  debounceMs?: number;
  /** Jerry API base URL, used to reload the MCP server after a build */
  jerryUrl?: string;
  /** Copy sources into the index so search_grep works (default: true) */
  copyContent?: boolean;
  /** Override the build executor (tests) */
  runner?: BuildRunner;
}

/**
 * Resolve the footnote index directory, expanding a leading `~`.
 *
 * Mirrors resolveFootnoteDbPath() in packages/jerry-app/src/mcp-config.ts so
 * the collector writes where the MCP server reads.
 */
export function resolveFootnoteDbPath(raw?: string): string {
  const value = raw || process.env.FOOTNOTE_DB || "./.footnote";
  if (value.startsWith("~/")) {
    return resolve(homedir(), value.slice(2));
  }
  return resolve(value);
}

/** Absolute path to the vendored docidx CLI. */
export function resolveDocidxPath(): string {
  return resolve(__dirname, "../../../vendor/footnote/bin/docidx.js");
}

function defaultRunner(args: string[]): Promise<BuildOutcome> {
  return new Promise((resolvePromise) => {
    execFile(
      process.execPath,
      [resolveDocidxPath(), ...args],
      { timeout: 10 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          resolvePromise({
            ok: false,
            output: stdout,
            error: stderr?.trim() || err.message,
          });
          return;
        }
        resolvePromise({ ok: true, output: stdout });
      }
    );
  });
}

/**
 * Ask the worker to respawn its footnote MCP child.
 *
 * The MCP server reads its manifest once and holds an open sqlite handle, so a
 * rebuild is not guaranteed to be visible to an already-running server.
 */
async function requestMcpReload(jerryUrl: string): Promise<void> {
  try {
    const response = await fetch(`${jerryUrl}/v1/mcp/reload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!response.ok) {
      console.warn(`MCP reload returned ${response.status}`);
    }
  } catch {
    // Worker may not be running; the next start picks up the index anyway.
  }
}

export function createFootnoteIndexer(config: FootnoteIndexerConfig) {
  const root = resolve(config.root);
  const dbPath = resolveFootnoteDbPath(config.dbPath);
  const embeddingModel = config.embeddingModel ?? "ollama:nomic-embed-text";
  const debounceMs = config.debounceMs ?? 3000;
  const jerryUrl = config.jerryUrl ?? "http://127.0.0.1:8787";
  const copyContent = config.copyContent ?? true;
  const runner = config.runner ?? defaultRunner;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;
  let rerunRequested = false;
  let stopped = false;

  function buildArgs(): string[] {
    const args = [
      "build",
      "--root",
      root,
      "--out",
      dbPath,
      "--embedding-model",
      embeddingModel,
    ];
    if (copyContent) args.push("--copy-content");
    return args;
  }

  async function runOnce(): Promise<void> {
    const started = Date.now();
    const outcome = await runner(buildArgs());
    const seconds = ((Date.now() - started) / 1000).toFixed(1);

    if (!outcome.ok) {
      console.error(`Footnote index build failed after ${seconds}s`);
      if (outcome.error) console.error(outcome.error);
      return;
    }

    console.log(`Footnote index updated in ${seconds}s (${dbPath})`);
    await requestMcpReload(jerryUrl);
  }

  function trigger(): Promise<void> {
    if (running) {
      rerunRequested = true;
      return running;
    }

    running = (async () => {
      try {
        do {
          rerunRequested = false;
          await runOnce();
        } while (rerunRequested && !stopped);
      } finally {
        running = null;
      }
    })();

    return running;
  }

  return {
    /** Note that files changed; starts a build once the quiet period elapses. */
    schedule() {
      if (stopped) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void trigger();
      }, debounceMs);
    },

    /** Run any pending build immediately and wait for the queue to drain. */
    async flush(): Promise<void> {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await trigger();
    },

    /** Stop scheduling and wait for an in-flight build to finish. */
    async stop(): Promise<void> {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await running;
    },

    isBuilding(): boolean {
      return running !== null;
    },

    get indexPath(): string {
      return dbPath;
    },

    get contentRoot(): string {
      return root;
    },
  };
}

export type FootnoteIndexer = ReturnType<typeof createFootnoteIndexer>;
