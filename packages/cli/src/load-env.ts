/**
 * Load a `.env` file into `process.env` (no dependency).
 *
 * Searches from `cwd` upward until a `.env` is found or the filesystem root.
 * Existing environment variables win — `.env` only fills gaps (same as dotenv).
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse as parsePath } from "node:path";

let loaded = false;

/**
 * Parse dotenv syntax: KEY=VALUE, optional quotes, `#` comments, blank lines.
 * Does not expand variables or support `export` prefixes beyond stripping them.
 */
export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const withoutExport = line.startsWith("export ")
      ? line.slice("export ".length).trim()
      : line;

    const eq = withoutExport.indexOf("=");
    if (eq <= 0) continue;

    const key = withoutExport.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = withoutExport.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }

  return out;
}

/**
 * Walk parents of `startDir` looking for a file named `.env`.
 */
export function findEnvFile(startDir: string = process.cwd()): string | null {
  let dir = startDir;
  const { root } = parsePath(dir);

  while (true) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;

    if (dir === root) return null;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export interface LoadEnvOptions {
  /** Explicit path; skips search when set. */
  path?: string;
  /** Directory to start searching from (default: cwd). */
  cwd?: string;
  /** When true, `.env` overwrites existing process.env values. */
  override?: boolean;
  /** Force a reload even if loadEnv already ran in this process. */
  force?: boolean;
  /** Target env object (default: process.env). Useful in tests. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Load `.env` into the environment once per process (unless `force`).
 * Returns the path that was loaded, or `null` if none was found.
 */
export function loadEnv(options: LoadEnvOptions = {}): string | null {
  const env = options.env ?? process.env;
  if (loaded && !options.force && env === process.env) {
    return null;
  }

  const path = options.path ?? findEnvFile(options.cwd ?? process.cwd());
  if (!path) {
    if (env === process.env) loaded = true;
    return null;
  }

  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch {
    return null;
  }

  const parsed = parseEnvFile(content);
  const override = options.override ?? false;

  for (const [key, value] of Object.entries(parsed)) {
    if (override || env[key] === undefined) {
      env[key] = value;
    }
  }

  if (env === process.env) loaded = true;
  return path;
}

/** Test helper — reset the once-per-process guard. */
export function resetLoadEnvForTests(): void {
  loaded = false;
}
