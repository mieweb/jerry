import { describe, it } from "node:test";
import assert from "node:assert";
import { PACKAGE } from "./index.ts";

describe("@mieweb/jerry-tools", () => {
  it("exports package name", () => {
    assert.strictEqual(PACKAGE, "@mieweb/jerry-tools");
  });
});
