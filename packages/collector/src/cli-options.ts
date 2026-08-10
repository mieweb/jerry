/**
 * Collector command-line options.
 *
 * Kept separate from cli.ts because that module starts the collector on import
 * (bin/collector.js imports it for side effects).
 */

export interface CliOptions {
  watchPaths: string[];
  awUrl: string;
  jerryUrl: string;
  pollInterval: number;
  /** Directory footnote indexes; defaults to the sole watch path */
  footnoteRoot?: string;
  /** Embedding model passed to docidx (ollama:…, an OpenAI model, or mock) */
  embeddingModel?: string;
  /** Keep the footnote index in sync with the watched folder */
  footnote: boolean;
  /** Ingest files that already exist when the collector starts */
  backfill: boolean;
  /** Also embed text files into the legacy VECTORS store */
  legacyVectorIngest: boolean;
  help: boolean;
}

/** Thrown for malformed command lines so main() can print usage and exit. */
export class CliUsageError extends Error {}

const FLAGS_WITH_VALUES = new Set([
  "--watch",
  "-w",
  "--aw-url",
  "--jerry-url",
  "--poll-interval",
  "--footnote-root",
  "--embedding-model",
]);

/**
 * Parse argv.
 *
 * Unknown arguments are a hard error: silently ignoring them let a shell-mangled
 * `' --watch'` start the collector with no watcher and no warning.
 */
export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    watchPaths: [],
    awUrl: process.env.AW_URL ?? "http://localhost:5600",
    jerryUrl: process.env.JERRY_URL ?? "http://127.0.0.1:8787",
    pollInterval: parseInt(process.env.POLL_INTERVAL ?? "30000", 10),
    footnoteRoot: process.env.JERRY_FOOTNOTE_ROOT,
    embeddingModel: process.env.JERRY_EMBEDDING_MODEL,
    footnote: true,
    backfill: true,
    legacyVectorIngest: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // pnpm forwards the `--` separator; ignore it rather than failing.
    if (arg === "--") continue;

    if (FLAGS_WITH_VALUES.has(arg)) {
      const value = args[++i];
      if (value === undefined) {
        throw new CliUsageError(`Missing value for ${arg}`);
      }
      switch (arg) {
        case "--watch":
        case "-w":
          options.watchPaths.push(value);
          break;
        case "--aw-url":
          options.awUrl = value;
          break;
        case "--jerry-url":
          options.jerryUrl = value;
          break;
        case "--poll-interval": {
          const parsed = parseInt(value, 10);
          if (Number.isNaN(parsed)) {
            throw new CliUsageError(
              `--poll-interval expects a number, got "${value}"`
            );
          }
          options.pollInterval = parsed;
          break;
        }
        case "--footnote-root":
          options.footnoteRoot = value;
          break;
        case "--embedding-model":
          options.embeddingModel = value;
          break;
      }
      continue;
    }

    switch (arg) {
      case "--no-footnote":
        options.footnote = false;
        break;
      case "--no-backfill":
        options.backfill = false;
        break;
      case "--legacy-vector-ingest":
        options.legacyVectorIngest = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new CliUsageError(`Unknown argument: ${JSON.stringify(arg)}`);
    }
  }

  return options;
}

/**
 * Pick the directory footnote indexes.
 *
 * A footnote index tracks exactly one root: building with a different root
 * against the same index deletes the previous root's documents. With several
 * watch paths and no explicit root, indexing is skipped rather than guessed.
 */
export function resolveFootnoteRoot(options: CliOptions): string | undefined {
  if (!options.footnote) return undefined;
  if (options.footnoteRoot) return options.footnoteRoot;
  if (options.watchPaths.length === 1) return options.watchPaths[0];
  return undefined;
}

export function formatHelp(): string {
  return `
jerry-collector — Local sidecar that pushes activity data to Jerry

Usage:
  jerry-collector [options]

Options:
  -w, --watch <path>       Directory to watch for files (can be repeated)
  --footnote-root <path>   Directory to keep in the footnote index
                           (default: the single --watch path)
  --embedding-model <m>    Embedder for indexing: ollama:<model>, an OpenAI
                           model, or mock (default: ollama:nomic-embed-text)
  --no-footnote            Do not maintain the footnote index
  --no-backfill            Skip files that already exist at startup
  --legacy-vector-ingest   Also embed text files into the VECTORS store
  --aw-url <url>           ActivityWatch API URL (default: http://localhost:5600)
  --jerry-url <url>        Jerry API URL (default: http://127.0.0.1:8787)
  --poll-interval <ms>     AW poll interval in milliseconds (default: 30000)
  -h, --help               Show this help

Environment variables:
  AW_URL                   ActivityWatch API URL
  JERRY_URL                Jerry API URL
  POLL_INTERVAL            AW poll interval in milliseconds
  FOOTNOTE_DB              Footnote index directory (default: ./.footnote)
  JERRY_FOOTNOTE_ROOT      Default --footnote-root
  JERRY_EMBEDDING_MODEL    Default --embedding-model

Examples:
  jerry-collector
  jerry-collector --watch ~/Notes
  jerry-collector --watch ~/Screenshots --watch ~/Notes --footnote-root ~/Notes
  jerry-collector --jerry-url http://localhost:8787
`.trim();
}
