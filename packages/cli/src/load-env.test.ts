import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseDotEnv } from "./load-env.js";

describe("parseDotEnv", () => {
  it("parses simple KEY=VALUE pairs", () => {
    const parsed = parseDotEnv("FOO=bar\nBAZ=qux\n");
    assert.equal(parsed.FOO, "bar");
    assert.equal(parsed.BAZ, "qux");
  });

  it("skips comments and blanks", () => {
    const parsed = parseDotEnv("# comment\n\nFOO=1\n");
    assert.deepEqual(parsed, { FOO: "1" });
  });

  it("strips matching quotes", () => {
    const parsed = parseDotEnv(`A="hello world"\nB='x'\n`);
    assert.equal(parsed.A, "hello world");
    assert.equal(parsed.B, "x");
  });

  it("ignores invalid keys", () => {
    const parsed = parseDotEnv("bad-key=1\n_OK=2\n");
    assert.equal(parsed["bad-key"], undefined);
    assert.equal(parsed._OK, "2");
  });
});
