import { describe, it } from "node:test";
import assert from "node:assert";
import { PACKAGE } from "./index.ts";

describe("@mieweb/jerry-app", () => {
  it("exports package name", () => {
    assert.strictEqual(PACKAGE, "@mieweb/jerry-app");
  });
});
