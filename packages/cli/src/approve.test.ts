import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { StreamEvent } from "@mieweb/cloud-agent-cli";
import { consumeStream, extractApproveFlag, withAllowToolsProfile } from "./approve.js";

async function* toAsyncIterable(
  events: StreamEvent[]
): AsyncGenerator<StreamEvent> {
  for (const event of events) {
    yield event;
  }
}

describe("extractApproveFlag", () => {
  it("detects --approve at the start", () => {
    const { approve, rest } = extractApproveFlag([
      "--approve",
      "what",
      "files",
    ]);
    assert.equal(approve, true);
    assert.deepEqual(rest, ["what", "files"]);
  });

  it("detects --approve after other flags", () => {
    const { approve, rest } = extractApproveFlag([
      "--debug",
      "--approve",
      "list",
      "drive",
    ]);
    assert.equal(approve, true);
    assert.deepEqual(rest, ["--debug", "list", "drive"]);
  });

  it("returns false when flag is absent", () => {
    const { approve, rest } = extractApproveFlag(["hello"]);
    assert.equal(approve, false);
    assert.deepEqual(rest, ["hello"]);
  });
});

describe("withAllowToolsProfile", () => {
  it("sets egress allow-tools on empty profile", () => {
    assert.deepEqual(withAllowToolsProfile(undefined), {
      egress: "allow-tools",
    });
  });

  it("preserves other profile fields", () => {
    assert.deepEqual(
      withAllowToolsProfile({ runtime: "byo-cloud", egress: "deny" }),
      { runtime: "byo-cloud", egress: "allow-tools" }
    );
  });
});

describe("consumeStream", () => {
  it("buffers text instead of printing it immediately", async () => {
    const events: StreamEvent[] = [
      { type: "start" },
      { type: "text", text: "Hello, " },
      { type: "text", text: "world." },
      { type: "finish", finishReason: "stop" },
    ];

    const result = await consumeStream(toAsyncIterable(events), {
      toolsUsed: [],
    });

    assert.equal(result.text, "Hello, world.");
    assert.equal(result.hadError, false);
    assert.equal(result.suspendedReason, undefined);
    assert.equal(result.finishReason, "stop");
  });

  it("captures the approval prompt text without printing it, and reports the suspend reason", async () => {
    const events: StreamEvent[] = [
      { type: "start" },
      {
        type: "text",
        text: 'Tool "fetch_youtube" requires approval.\n\nReply to approve and execute this exact call.',
      },
      {
        type: "suspended",
        reason: "waiting_for_approval",
        message: "Waiting for approval to execute fetch_youtube",
        toolsUsed: ["fetch_youtube"],
      },
    ];

    const toolsUsed: string[] = [];
    const result = await consumeStream(toAsyncIterable(events), {
      toolsUsed,
    });

    // Text is buffered, not printed — caller decides whether to discard it.
    assert.match(result.text, /requires approval/);
    assert.equal(result.suspendedReason, "waiting_for_approval");
    assert.deepEqual(toolsUsed, ["fetch_youtube"]);
  });

  it("dedupes tool names across tool-call, tool-result, suspended, and finish events", async () => {
    const events: StreamEvent[] = [
      { type: "tool-call", toolName: "fetch_youtube", input: {} },
      { type: "tool-result", toolName: "fetch_youtube", output: {} },
      {
        type: "suspended",
        reason: "waiting_for_approval",
        toolsUsed: ["fetch_youtube"],
      },
      { type: "finish", finishReason: "stop", toolsUsed: ["fetch_youtube"] },
    ];

    const toolsUsed: string[] = [];
    await consumeStream(toAsyncIterable(events), { toolsUsed });

    assert.deepEqual(toolsUsed, ["fetch_youtube"]);
  });

  it("marks hadError on error events", async () => {
    const events: StreamEvent[] = [{ type: "error", message: "boom" }];

    const result = await consumeStream(toAsyncIterable(events), {
      toolsUsed: [],
    });

    assert.equal(result.hadError, true);
  });
});
