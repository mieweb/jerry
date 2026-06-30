import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV1 } from "ai/test";
import type { PrivacyProfile, RuntimeEvent } from "./types.ts";
import { mapStreamPartToEvents } from "./stream/map-events.ts";

const baseProfile: PrivacyProfile = {
  runtime: "local",
  model: "ollama:qwen2.5",
  egress: "deny",
  tools: { aw: "local" },
};

describe("mapStreamPartToEvents", () => {
  it("maps text-delta to RuntimeEvent", () => {
    const events = [...mapStreamPartToEvents({ type: "text-delta", textDelta: "Hello" })];
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], { type: "text-delta", text: "Hello" });
  });

  it("maps tool-call to RuntimeEvent", () => {
    const events = [
      ...mapStreamPartToEvents({
        type: "tool-call",
        toolCallId: "call-1",
        toolName: "aw",
        args: { query: "test" },
      }),
    ];
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], {
      type: "tool-call",
      toolCallId: "call-1",
      toolName: "aw",
      input: { query: "test" },
    });
  });

  it("maps tool-result to RuntimeEvent", () => {
    const events = [
      ...mapStreamPartToEvents({
        type: "tool-result",
        toolCallId: "call-1",
        toolName: "aw",
        args: { query: "test" },
        result: { data: "result" },
      }),
    ];
    assert.equal(events.length, 1);
    assert.deepEqual(events[0], {
      type: "tool-result",
      toolCallId: "call-1",
      toolName: "aw",
      output: { data: "result" },
    });
  });

  it("maps finish to RuntimeEvent", () => {
    const events = [
      ...mapStreamPartToEvents({
        type: "finish",
        finishReason: "stop",
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        providerMetadata: undefined,
        response: { id: "test", modelId: "test", timestamp: new Date() },
      } as Parameters<typeof mapStreamPartToEvents>[0]),
    ];
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "finish");
    if (events[0].type === "finish") {
      assert.equal(events[0].finishReason, "stop");
      assert.deepEqual(events[0].usage, { promptTokens: 10, completionTokens: 20, totalTokens: 30 });
    }
  });

  it("maps error to RuntimeEvent", () => {
    const error = new Error("Test error");
    const events = [...mapStreamPartToEvents({ type: "error", error })];
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "error");
    if (events[0].type === "error") {
      assert.equal(events[0].message, "Test error");
      assert.equal(events[0].cause, error);
    }
  });

  it("ignores step-start events", () => {
    const events = [
      ...mapStreamPartToEvents({
        type: "step-start",
      } as Parameters<typeof mapStreamPartToEvents>[0]),
    ];
    assert.equal(events.length, 0);
  });

  it("ignores step-finish events", () => {
    const events = [
      ...mapStreamPartToEvents({
        type: "step-finish",
        finishReason: "stop",
        usage: { promptTokens: 10, completionTokens: 20 },
        isContinued: false,
      } as Parameters<typeof mapStreamPartToEvents>[0]),
    ];
    assert.equal(events.length, 0);
  });
});

describe("local runtime integration", () => {
  it("MockLanguageModelV1 can simulate text stream", async () => {
    const model = new MockLanguageModelV1({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: "text-delta", textDelta: "Hello" },
            { type: "text-delta", textDelta: " world" },
            {
              type: "finish",
              finishReason: "stop",
              usage: { promptTokens: 5, completionTokens: 2 },
            },
          ],
        }),
        rawCall: { rawPrompt: null, rawSettings: {} },
      }),
    });

    const result = await model.doStream({
      inputFormat: "messages",
      mode: { type: "regular" },
      prompt: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
    });

    const chunks: unknown[] = [];
    const reader = result.stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    assert.equal(chunks.length, 3);
  });

  it("MockLanguageModelV1 can simulate tool call", async () => {
    const model = new MockLanguageModelV1({
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            {
              type: "tool-call",
              toolCallType: "function",
              toolCallId: "call-1",
              toolName: "getWeather",
              args: '{"city":"SF"}',
            },
            {
              type: "finish",
              finishReason: "tool-calls",
              usage: { promptTokens: 10, completionTokens: 5 },
            },
          ],
        }),
        rawCall: { rawPrompt: null, rawSettings: {} },
      }),
    });

    const result = await model.doStream({
      inputFormat: "messages",
      mode: { type: "regular" },
      prompt: [{ role: "user", content: [{ type: "text", text: "Weather in SF?" }] }],
    });

    const chunks: unknown[] = [];
    const reader = result.stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    assert.equal(chunks.length, 2);
    const toolCall = chunks[0] as { type: string; toolName: string };
    assert.equal(toolCall.type, "tool-call");
    assert.equal(toolCall.toolName, "getWeather");
  });
});

describe("local runtime with Ollama", () => {
  const shouldRun = process.env.JERRY_OLLAMA_TEST === "1";
  const ollamaModel = process.env.JERRY_OLLAMA_MODEL ?? "ollama:qwen2.5";
  const modelId = ollamaModel.startsWith("ollama:") ? ollamaModel : `ollama:${ollamaModel}`;

  it("talks to Ollama", { skip: !shouldRun }, async () => {
    const { resolveRuntime } = await import("./resolve-runtime.ts");
    const runtime = resolveRuntime({ ...baseProfile, model: modelId });

    const events: RuntimeEvent[] = [];
    for await (const event of runtime.runTurn({
      messages: [{ role: "user", content: "Say hello in exactly 3 words." }],
    })) {
      events.push(event);
    }

    assert.ok(events.length > 0, "Should receive events");
    assert.equal(events[0].type, "start");

    const hasTextOrFinish = events.some(
      (e) => e.type === "text-delta" || e.type === "finish"
    );
    assert.ok(hasTextOrFinish, "Should have text-delta or finish events");
  });
});
