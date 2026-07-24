/**
 * Footnote health check adapter.
 *
 * Verifies the Footnote database directory exists with required index files.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import type { HealthCheck, HealthResult } from "./types.ts";

export interface FootnoteCheckOptions {
  dbPath?: string;
  existsFn?: (path: string) => boolean;
}

function resolveFootnoteDbPath(raw?: string): string {
  const path = raw ?? process.env.FOOTNOTE_DB ?? "./.footnote";
  if (path.startsWith("~/")) {
    return resolve(homedir(), path.slice(2));
  }
  return resolve(path);
}

export function createFootnoteCheck(opts?: FootnoteCheckOptions): HealthCheck {
  const dbPath = resolveFootnoteDbPath(opts?.dbPath);
  const existsFn = opts?.existsFn ?? existsSync;

  return {
    name: "Footnote",
    description: "Document search index",
    required: false,

    async check(): Promise<HealthResult> {
      const indexPath = resolve(dbPath, "index.sqlite");
      const manifestPath = resolve(dbPath, "manifest.json");

      const dirExists = existsFn(dbPath);
      const indexExists = existsFn(indexPath);
      const manifestExists = existsFn(manifestPath);

      if (!dirExists) {
        return {
          status: "warn",
          message: `Database directory not found: ${dbPath}`,
          details: { dbPath, dirExists: false },
        };
      }

      if (!indexExists || !manifestExists) {
        const missing: string[] = [];
        if (!indexExists) missing.push("index.sqlite");
        if (!manifestExists) missing.push("manifest.json");

        return {
          status: "warn",
          message: `Index incomplete: missing ${missing.join(", ")}`,
          details: {
            dbPath,
            dirExists: true,
            indexExists,
            manifestExists,
          },
        };
      }

      return {
        status: "ok",
        message: `Index ready at ${dbPath}`,
        details: {
          dbPath,
          dirExists: true,
          indexExists: true,
          manifestExists: true,
        },
      };
    },
  };
}
