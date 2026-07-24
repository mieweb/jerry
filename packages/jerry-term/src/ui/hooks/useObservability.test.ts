/**
 * Tests for useObservability hook helpers and state machine logic.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  truncate,
  getLatencyColor,
  formatDuration,
  type ObservabilityState,
} from "./useObservability.ts";
import type { RuntimeEvent } from "@mieweb/jerry-agent-runtime";

function createInitialState(): ObservabilityState {
  return {
    tools: new Map(),
    phase: "idle",
    toolsExpanded: true,
    thinkingExpanded: true,
    outputsExpanded: false,
  };
}

function applyEvent(state: ObservabilityState, event: RuntimeEvent): ObservabilityState {
  switch (event.type) {
    case "start":
      return { ...state, phase: "waiting" };

    case "tool-call": {
      const newTools = new Map(state.tools);
      newTools.set(event.toolCallId, {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        input: event.input,
        status: "running",
        startedAt: Date.now(),
      });
      return { ...state, tools: newTools, phase: "tools" };
    }

    case "tool-result": {
      const newTools = new Map(state.tools);
      const existing = newTools.get(event.toolCallId);
      if (existing) {
        newTools.set(event.toolCallId, {
          ...existing,
          output: event.output,
          status: "success",
          durationMs: Date.now() - existing.startedAt,
        });
      }
      return { ...state, tools: newTools };
    }

    case "text-delta":
      if (state.phase !== "generating") {
        return { ...state, phase: "generating" };
      }
      return state;

    case "finish":
      return { ...state, phase: "idle" };

    case "error": {
      const newTools = new Map(state.tools);
      for (const [id, tool] of newTools) {
        if (tool.status === "running") {
          newTools.set(id, {
            ...tool,
            status: "error",
            durationMs: Date.now() - tool.startedAt,
          });
        }
      }
      return { ...state, tools: newTools, phase: "idle" };
    }

    default:
      return state;
  }
}

describe("truncate helper", () => {
  it("returns original string when shorter than max", () => {
    assert.equal(truncate("hello", 10), "hello");
  });

  it("returns original string when exactly max length", () => {
    assert.equal(truncate("hello", 5), "hello");
  });

  it("truncates and adds ellipsis when longer than max", () => {
    assert.equal(truncate("hello world", 8), "hello...");
  });

  it("handles empty string", () => {
    assert.equal(truncate("", 10), "");
  });

  it("handles max length of 3", () => {
    assert.equal(truncate("abcdef", 3), "...");
  });

  it("truncates to 200 chars as per spec", () => {
    const longText = "a".repeat(250);
    const result = truncate(longText, 200);
    assert.equal(result.length, 200);
    assert.ok(result.endsWith("..."));
  });
});

describe("getLatencyColor helper", () => {
  it("returns success for fast latency (< 500ms)", () => {
    assert.equal(getLatencyColor(0), "success");
    assert.equal(getLatencyColor(100), "success");
    assert.equal(getLatencyColor(499), "success");
  });

  it("returns warning for moderate latency (500-2000ms)", () => {
    assert.equal(getLatencyColor(500), "warning");
    assert.equal(getLatencyColor(1000), "warning");
    assert.equal(getLatencyColor(1999), "warning");
  });

  it("returns error for slow latency (>= 2000ms)", () => {
    assert.equal(getLatencyColor(2000), "error");
    assert.equal(getLatencyColor(5000), "error");
    assert.equal(getLatencyColor(10000), "error");
  });
});

describe("formatDuration helper", () => {
  it("formats milliseconds when < 1000", () => {
    assert.equal(formatDuration(0), "0ms");
    assert.equal(formatDuration(500), "500ms");
    assert.equal(formatDuration(999), "999ms");
  });

  it("formats seconds when >= 1000", () => {
    assert.equal(formatDuration(1000), "1.0s");
    assert.equal(formatDuration(2500), "2.5s");
    assert.equal(formatDuration(10000), "10.0s");
  });
});

describe("observability state machine", () => {
  describe("phase transitions", () => {
    it("transitions to waiting on start event", () => {
      const state = createInitialState();
      const next = applyEvent(state, { type: "start" });
      assert.equal(next.phase, "waiting");
    });

    it("transitions to tools on first tool-call", () => {
      let state = createInitialState();
      state = applyEvent(state, { type: "start" });
      state = applyEvent(state, {
        type: "tool-call",
        toolCallId: "tc-1",
        toolName: "search",
        input: { query: "test" },
      });
      assert.equal(state.phase, "tools");
    });

    it("transitions to generating on first text-delta", () => {
      let state = createInitialState();
      state = applyEvent(state, { type: "start" });
      state = applyEvent(state, { type: "text-delta", text: "Hello" });
      assert.equal(state.phase, "generating");
    });

    it("stays in generating for subsequent text-deltas", () => {
      let state = createInitialState();
      state = applyEvent(state, { type: "start" });
      state = applyEvent(state, { type: "text-delta", text: "Hello" });
      state = applyEvent(state, { type: "text-delta", text: " world" });
      assert.equal(state.phase, "generating");
    });

    it("transitions to idle on finish", () => {
      let state = createInitialState();
      state = applyEvent(state, { type: "start" });
      state = applyEvent(state, { type: "text-delta", text: "Hello" });
      state = applyEvent(state, { type: "finish", finishReason: "stop" });
      assert.equal(state.phase, "idle");
    });

    it("transitions to idle on error", () => {
      let state = createInitialState();
      state = applyEvent(state, { type: "start" });
      state = applyEvent(state, { type: "error", message: "Something failed" });
      assert.equal(state.phase, "idle");
    });
  });

  describe("tool tracking", () => {
    it("adds tool to map on tool-call", () => {
      let state = createInitialState();
      state = applyEvent(state, {
        type: "tool-call",
        toolCallId: "tc-1",
        toolName: "search",
        input: { query: "test" },
      });

      assert.equal(state.tools.size, 1);
      const tool = state.tools.get("tc-1");
      assert.ok(tool);
      assert.equal(tool.toolName, "search");
      assert.equal(tool.status, "running");
      assert.deepEqual(tool.input, { query: "test" });
    });

    it("updates tool status to success on tool-result", () => {
      let state = createInitialState();
      state = applyEvent(state, {
        type: "tool-call",
        toolCallId: "tc-1",
        toolName: "search",
        input: { query: "test" },
      });
      state = applyEvent(state, {
        type: "tool-result",
        toolCallId: "tc-1",
        toolName: "search",
        output: { results: [] },
      });

      const tool = state.tools.get("tc-1");
      assert.ok(tool);
      assert.equal(tool.status, "success");
      assert.deepEqual(tool.output, { results: [] });
      assert.ok(typeof tool.durationMs === "number");
    });

    it("tracks multiple tools", () => {
      let state = createInitialState();
      state = applyEvent(state, {
        type: "tool-call",
        toolCallId: "tc-1",
        toolName: "search",
        input: {},
      });
      state = applyEvent(state, {
        type: "tool-call",
        toolCallId: "tc-2",
        toolName: "summarize",
        input: {},
      });

      assert.equal(state.tools.size, 2);
      assert.ok(state.tools.has("tc-1"));
      assert.ok(state.tools.has("tc-2"));
    });

    it("marks running tools as error on turn error", () => {
      let state = createInitialState();
      state = applyEvent(state, {
        type: "tool-call",
        toolCallId: "tc-1",
        toolName: "search",
        input: {},
      });
      state = applyEvent(state, {
        type: "tool-result",
        toolCallId: "tc-1",
        toolName: "search",
        output: "done",
      });
      state = applyEvent(state, {
        type: "tool-call",
        toolCallId: "tc-2",
        toolName: "failing-tool",
        input: {},
      });
      state = applyEvent(state, {
        type: "error",
        message: "Network error",
      });

      const tool1 = state.tools.get("tc-1");
      const tool2 = state.tools.get("tc-2");
      assert.ok(tool1);
      assert.ok(tool2);
      assert.equal(tool1.status, "success");
      assert.equal(tool2.status, "error");
    });

    it("ignores tool-result for unknown toolCallId", () => {
      let state = createInitialState();
      state = applyEvent(state, {
        type: "tool-result",
        toolCallId: "unknown",
        toolName: "search",
        output: {},
      });

      assert.equal(state.tools.size, 0);
    });
  });

  describe("UI flags", () => {
    it("starts with panels expanded", () => {
      const state = createInitialState();
      assert.equal(state.toolsExpanded, true);
      assert.equal(state.thinkingExpanded, true);
      assert.equal(state.outputsExpanded, false);
    });
  });

  describe("full turn flow", () => {
    it("handles typical turn with tools", () => {
      let state = createInitialState();

      state = applyEvent(state, { type: "start" });
      assert.equal(state.phase, "waiting");

      state = applyEvent(state, {
        type: "tool-call",
        toolCallId: "tc-1",
        toolName: "summarize_activity",
        input: { timeRange: "today" },
      });
      assert.equal(state.phase, "tools");
      assert.equal(state.tools.size, 1);

      state = applyEvent(state, {
        type: "tool-result",
        toolCallId: "tc-1",
        toolName: "summarize_activity",
        output: "You spent 2 hours in VS Code...",
      });
      const tool = state.tools.get("tc-1");
      assert.equal(tool?.status, "success");

      state = applyEvent(state, { type: "text-delta", text: "Based on " });
      assert.equal(state.phase, "generating");

      state = applyEvent(state, { type: "text-delta", text: "your activity..." });
      assert.equal(state.phase, "generating");

      state = applyEvent(state, { type: "finish", finishReason: "stop" });
      assert.equal(state.phase, "idle");
      assert.equal(state.tools.size, 1);
    });

    it("handles turn without tools", () => {
      let state = createInitialState();

      state = applyEvent(state, { type: "start" });
      assert.equal(state.phase, "waiting");

      state = applyEvent(state, { type: "text-delta", text: "Hello!" });
      assert.equal(state.phase, "generating");

      state = applyEvent(state, { type: "finish", finishReason: "stop" });
      assert.equal(state.phase, "idle");
      assert.equal(state.tools.size, 0);
    });
  });
});
