/**
 * Tests for the footnote indexer's debounce and serialisation behaviour.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { homedir } from "node:os";
import {
  createFootnoteIndexer,
  resolveFootnoteDbPath,
  type BuildOutcome,
} from "./footnote-index.ts";

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  // The indexer pings the worker after every successful build.
  globalThis.fetch = (async () => ({ ok: true })) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Runner that parks each build until the test releases it. */
function createGatedRunner() {
  const calls: string[][] = [];
  const gates: Array<() => void> = [];

  const runner = async (args: string[]): Promise<BuildOutcome> => {
    calls.push(args);
    await new Promise<void>((release) => gates.push(release));
    return { ok: true };
  };

  async function waitForCalls(count: number): Promise<void> {
    while (calls.length < count) await new Promise((r) => setImmediate(r));
  }

  return { calls, gates, runner, waitForCalls };
}

describe("createFootnoteIndexer", () => {
  it("passes the root, index path and embedding model to docidx", async () => {
    const calls: string[][] = [];
    const indexer = createFootnoteIndexer({
      root: "/docs",
      dbPath: "/tmp/idx",
      debounceMs: 0,
      runner: async (args) => {
        calls.push(args);
        return { ok: true };
      },
    });

    await indexer.flush();

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], [
      "build",
      "--root",
      resolve("/docs"),
      "--out",
      resolve("/tmp/idx"),
      "--embedding-model",
      "ollama:nomic-embed-text",
      "--copy-content",
    ]);
  });

  it("coalesces a burst of changes into a single build", async () => {
    let builds = 0;
    const indexer = createFootnoteIndexer({
      root: "/docs",
      dbPath: "/tmp/idx",
      debounceMs: 20,
      runner: async () => {
        builds++;
        return { ok: true };
      },
    });

    indexer.schedule();
    indexer.schedule();
    indexer.schedule();
    await indexer.flush();

    assert.equal(builds, 1);
  });

  it("never runs two builds at once and reruns once for changes during a build", async () => {
    const { calls, gates, runner, waitForCalls } = createGatedRunner();
    const indexer = createFootnoteIndexer({
      root: "/docs",
      dbPath: "/tmp/idx",
      debounceMs: 0,
      runner,
    });

    const first = indexer.flush();
    await waitForCalls(1);

    // Changes arriving mid-build must not start a parallel docidx process:
    // footnote's sqlite index has no WAL and no app-level locking.
    const second = indexer.flush();
    assert.equal(calls.length, 1);
    assert.equal(indexer.isBuilding(), true);

    gates[0]();
    await waitForCalls(2);
    gates[1]();
    await Promise.all([first, second]);

    // One build for the initial call, one rerun for the changes that arrived.
    assert.equal(calls.length, 2);
    assert.equal(indexer.isBuilding(), false);
  });

  it("reports failure without throwing", async () => {
    const indexer = createFootnoteIndexer({
      root: "/docs",
      dbPath: "/tmp/idx",
      debounceMs: 0,
      runner: async () => ({ ok: false, error: "ollama offline" }),
    });

    await indexer.flush();
    assert.equal(indexer.isBuilding(), false);
  });

  it("stops scheduling after stop()", async () => {
    let builds = 0;
    const indexer = createFootnoteIndexer({
      root: "/docs",
      dbPath: "/tmp/idx",
      debounceMs: 5,
      runner: async () => {
        builds++;
        return { ok: true };
      },
    });

    await indexer.stop();
    indexer.schedule();
    await new Promise((r) => setTimeout(r, 20));

    assert.equal(builds, 0);
  });
});

describe("resolveFootnoteDbPath", () => {
  it("expands a leading tilde", () => {
    assert.equal(
      resolveFootnoteDbPath("~/jerry-footnote/.footnote"),
      resolve(homedir(), "jerry-footnote/.footnote")
    );
  });

  it("resolves a relative path to absolute", () => {
    assert.equal(resolveFootnoteDbPath("./.footnote"), resolve("./.footnote"));
  });
});
