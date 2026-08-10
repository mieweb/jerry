/**
 * Tests for collector option parsing.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CliUsageError,
  parseArgs,
  resolveFootnoteRoot,
} from "./cli-options.ts";

// parseArgs falls back to these; a developer's shell must not change results.
const OVERRIDDEN_ENV = [
  "AW_URL",
  "JERRY_URL",
  "POLL_INTERVAL",
  "JERRY_FOOTNOTE_ROOT",
  "JERRY_EMBEDDING_MODEL",
] as const;

const savedEnv: Record<string, string | undefined> = {};

before(() => {
  for (const key of OVERRIDDEN_ENV) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

after(() => {
  for (const key of OVERRIDDEN_ENV) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("parseArgs", () => {
  it("collects repeated watch paths", () => {
    const options = parseArgs(["--watch", "/a", "-w", "/b"]);
    assert.deepEqual(options.watchPaths, ["/a", "/b"]);
  });

  it("ignores the pnpm -- separator", () => {
    const options = parseArgs(["--", "--watch", "/a"]);
    assert.deepEqual(options.watchPaths, ["/a"]);
  });

  it("rejects an unknown argument instead of ignoring it", () => {
    assert.throws(() => parseArgs(["--wtch", "/a"]), CliUsageError);
  });

  it("rejects a flag mangled by shell line continuation", () => {
    // A stray backslash produces a leading space: ' --watch'
    assert.throws(() => parseArgs([" --watch", "/a"]), CliUsageError);
  });

  it("rejects a flag that is missing its value", () => {
    assert.throws(() => parseArgs(["--watch"]), CliUsageError);
  });

  it("rejects a non-numeric poll interval", () => {
    assert.throws(() => parseArgs(["--poll-interval", "soon"]), CliUsageError);
  });

  it("defaults footnote and backfill on, legacy vector ingest off", () => {
    const options = parseArgs([]);
    assert.equal(options.footnote, true);
    assert.equal(options.backfill, true);
    assert.equal(options.legacyVectorIngest, false);
  });

  it("honours the negating flags", () => {
    const options = parseArgs([
      "--no-footnote",
      "--no-backfill",
      "--legacy-vector-ingest",
    ]);
    assert.equal(options.footnote, false);
    assert.equal(options.backfill, false);
    assert.equal(options.legacyVectorIngest, true);
  });

  it("parses the embedding model override", () => {
    const options = parseArgs(["--embedding-model", "mock"]);
    assert.equal(options.embeddingModel, "mock");
  });

  it("parses urls and poll interval", () => {
    const options = parseArgs([
      "--aw-url",
      "http://aw:1",
      "--jerry-url",
      "http://jerry:2",
      "--poll-interval",
      "1500",
    ]);
    assert.equal(options.awUrl, "http://aw:1");
    assert.equal(options.jerryUrl, "http://jerry:2");
    assert.equal(options.pollInterval, 1500);
  });
});

describe("resolveFootnoteRoot", () => {
  it("uses the sole watch path", () => {
    assert.equal(resolveFootnoteRoot(parseArgs(["--watch", "/docs"])), "/docs");
  });

  it("prefers an explicit footnote root", () => {
    const options = parseArgs([
      "--watch",
      "/docs",
      "--footnote-root",
      "/notes",
    ]);
    assert.equal(resolveFootnoteRoot(options), "/notes");
  });

  it("returns undefined for several watch paths without an explicit root", () => {
    // One footnote index tracks one root; guessing would prune the other.
    const options = parseArgs(["--watch", "/a", "--watch", "/b"]);
    assert.equal(resolveFootnoteRoot(options), undefined);
  });

  it("returns undefined when footnote is disabled", () => {
    const options = parseArgs(["--watch", "/docs", "--no-footnote"]);
    assert.equal(resolveFootnoteRoot(options), undefined);
  });
});
