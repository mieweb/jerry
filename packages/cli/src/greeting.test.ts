import { describe, it } from "node:test";
import assert from "node:assert";
import { isGreeting, normalizeMessage } from "./greeting.ts";

describe("isGreeting", () => {
  it("matches bare greetings", () => {
    for (const message of ["hi", "hey", "hello", "yo", "HELLO", "Hi!"]) {
      assert.strictEqual(isGreeting(message), true, message);
    }
  });

  it("matches greetings addressed to jerry", () => {
    for (const message of ["hi jerry", "hello Jerry", "hey jerry!", "yo jerry."]) {
      assert.strictEqual(isGreeting(message), true, message);
    }
  });

  it("tolerates padding and repeated spaces", () => {
    assert.strictEqual(isGreeting("  hello   jerry  "), true);
  });

  it("does not swallow a greeting followed by a task", () => {
    for (const message of [
      "hi jerry summarize my day",
      "hello what did I do today",
      "hey jerry, check my notes",
    ]) {
      assert.strictEqual(isGreeting(message), false, message);
    }
  });

  it("rejects non-greetings and empty input", () => {
    for (const message of ["", "   ", "summarize my last 2 hours", "hiya", "highlight"]) {
      assert.strictEqual(isGreeting(message), false, message);
    }
  });
});

describe("normalizeMessage", () => {
  it("collapses whitespace and trims", () => {
    assert.strictEqual(normalizeMessage("  hi   there \n"), "hi there");
  });
});
