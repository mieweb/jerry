import { describe, it } from "node:test";
import assert from "node:assert";
import { PACKAGE } from "./index.ts";

describe("@mieweb/jerry-collector", () => {
  it("exports package name", () => {
    assert.strictEqual(PACKAGE, "@mieweb/jerry-collector");
  });
});
