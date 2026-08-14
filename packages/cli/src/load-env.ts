/**
 * Load a repo `.env` into `process.env` (does not override existing vars).
 *
 * Walks from cwd upward until a `.env` is found or the filesystem root.
 * Safe to import for side effects (e.g. `NODE_OPTIONS=--import @mieweb/jerry-cli/load-env`).
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse as parsePath } from "node:path";

/**
 * Parse KEY=VALUE lines from dotenv content.
 * Supports optional single/double quotes; skips blanks and `#` comments.
 */
export function parseDotEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = line.slice(eq + 1).trim();
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
 * Find `.env` by walking parents of `startDir`.
 */
export function findDotEnvPath(startDir: string = process.cwd()): string | null {
  let dir = startDir;
  for (;;) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir || parsePath(dir).root === dir) return null;
    dir = parent;
  }
}

/**
 * Load `.env` into `process.env`. Existing env wins (shell exports take precedence).
 *
 * @returns path loaded, or null if none found
 */
export function loadDotEnv(startDir?: string): string | null {
  const path = findDotEnvPath(startDir);
  if (!path) return null;

  const parsed = parseDotEnv(readFileSync(path, "utf-8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      if (/^\$\(.*\)$/.test(value.trim())) {
        console.warn(
          `[jerry] ${key} in ${path} looks like unexpanded shell $(...); ` +
            `dotenv does not run commands — paste the command output instead`
        );
      }
      process.env[key] = value;
    }
  }
  return path;
}

// Side-effect import for `pnpm dev` / NODE_OPTIONS --import
loadDotEnv();
