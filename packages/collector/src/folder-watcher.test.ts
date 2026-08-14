/**
 * Tests for folder watcher path filtering.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createIgnoreMatcher } from "./folder-watcher.ts";

describe("createIgnoreMatcher", () => {
  const isIgnored = createIgnoreMatcher();

  it("skips the directories that exhaust file descriptors", () => {
    // Watching a repo root without these produced EMFILE within seconds.
    assert.equal(isIgnored(join("/repo", "node_modules", "pkg", "a.md")), true);
    assert.equal(isIgnored(join("/repo", ".git", "HEAD")), true);
    assert.equal(isIgnored(join("/repo", "dist", "bundle.js")), true);
  });

  it("skips Jerry's own state directories", () => {
    assert.equal(isIgnored(join("/repo", ".data", "local", "d1.sqlite")), true);
    assert.equal(isIgnored(join("/repo", ".footnote", "index.sqlite")), true);
  });

  it("allows ordinary content paths", () => {
    assert.equal(isIgnored(join("/repo", "docs", "plans", "phase-2.md")), false);
    assert.equal(isIgnored(join("/repo", "README.md")), false);
  });

  it("skips .DS_Store anywhere", () => {
    assert.equal(isIgnored(join("/repo", "docs", ".DS_Store")), true);
  });

  it("accepts extra ignored names", () => {
    const matcher = createIgnoreMatcher(["vendor"]);
    assert.equal(matcher(join("/repo", "vendor", "footnote", "a.md")), true);
    assert.equal(matcher(join("/repo", "docs", "a.md")), false);
  });
});
