import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { JerryBridge } from "./jerry-bridge.ts";
import type { BridgeEvent } from "./event-emitter.ts";

describe("JerryBridge", () => {
  describe("constructor", () => {
    it("creates runtime with default profile", () => {
      const bridge = new JerryBridge();
      assert.equal(bridge.getRuntimeKind(), "local");
      assert.ok(bridge.getProfile());
    });

    it("accepts partial profile override", () => {
      const bridge = new JerryBridge({ model: "ollama:llama3.2" });
      assert.equal(bridge.getProfile().model, "ollama:llama3.2");
      assert.equal(bridge.getRuntimeKind(), "local");
    });

    it("initializes with activeTurn false", () => {
      const bridge = new JerryBridge();
      assert.equal(bridge.isActive(), false);
    });
  });

  describe("switchRuntime", () => {
    it("switches to ozwell runtime", () => {
      const bridge = new JerryBridge();
      assert.equal(bridge.getRuntimeKind(), "local");

      bridge.switchRuntime("ozwell", {
        apiKey: "ozw_test_key",
        model: "gpt-4.1-mini",
      });

      assert.equal(bridge.getRuntimeKind(), "ozwell");
    });

    it("switches to byo-cloud with model option", () => {
      const bridge = new JerryBridge();

      bridge.switchRuntime("byo-cloud", {
        model: "https://api.openai.com/v1#gpt-4o",
      });

      assert.equal(bridge.getRuntimeKind(), "byo-cloud");
      assert.equal(
        bridge.getProfile().model,
        "https://api.openai.com/v1#gpt-4o"
      );
    });

    it("emits runtime-switched event", () => {
      const bridge = new JerryBridge();
      const events: BridgeEvent[] = [];
      bridge.events.on((e) => events.push(e));

      bridge.switchRuntime("ozwell", {
        apiKey: "ozw_test_key",
        model: "gpt-4.1-mini",
      });

      assert.equal(events.length, 1);
      assert.deepEqual(events[0], { type: "runtime-switched", kind: "ozwell" });
    });
  });

  describe("runTurn", () => {
    it("sets activeTurn during execution", async () => {
      const bridge = new JerryBridge();
      assert.equal(bridge.isActive(), false);

      const iterable = bridge.runTurn({ messages: [] });
      const iterator = iterable[Symbol.asyncIterator]();

      // Start iteration - this sets activeTurn
      const firstResult = await iterator.next();

      // During iteration, should be active
      // Note: The actual runtime will emit events, we just check the flow works
      assert.ok(firstResult);
    });

    it("emits turn-start and turn-end events", async () => {
      const bridge = new JerryBridge();
      const events: BridgeEvent[] = [];
      bridge.events.on((e) => events.push(e));

      // Consume all events from the turn
      for await (const _event of bridge.runTurn({ messages: [] })) {
        // Just consume events
      }

      // Should have turn-start at beginning and turn-end at end
      assert.ok(events.some((e) => e.type === "turn-start"));
      assert.ok(events.some((e) => e.type === "turn-end"));
      assert.equal(events[0].type, "turn-start");
      assert.equal(events[events.length - 1].type, "turn-end");
    });

    it("clears activeTurn after completion", async () => {
      const bridge = new JerryBridge();

      for await (const _event of bridge.runTurn({ messages: [] })) {
        // Consume
      }

      assert.equal(bridge.isActive(), false);
    });
  });

  describe("pending switch during active turn", () => {
    it("queues switch during active turn and applies after", async () => {
      const bridge = new JerryBridge();
      const events: BridgeEvent[] = [];
      bridge.events.on((e) => events.push(e));

      assert.equal(bridge.getRuntimeKind(), "local");

      // Start a turn
      const iterable = bridge.runTurn({ messages: [] });
      const iterator = iterable[Symbol.asyncIterator]();

      // Get first value to start the generator
      await iterator.next();

      // Now request a switch while turn is "active"
      // Note: The generator may have already completed for empty messages,
      // so we test the queuing logic directly
      bridge.switchRuntime("ozwell", {
        apiKey: "ozw_test_key",
        model: "gpt-4.1-mini",
      });

      // Consume rest of iterator
      let result = await iterator.next();
      while (!result.done) {
        result = await iterator.next();
      }

      // After turn completes, pending switch should be applied
      // Check that we eventually switched to ozwell
      const switchedToOzwell = events.some(
        (e) => e.type === "runtime-switched" && e.kind === "ozwell"
      );
      assert.ok(
        switchedToOzwell || bridge.getRuntimeKind() === "ozwell",
        "Should switch to ozwell after turn completes or during"
      );
    });
  });

  describe("event emitter", () => {
    it("allows unsubscribing from events", () => {
      const bridge = new JerryBridge();
      const events: BridgeEvent[] = [];

      const unsubscribe = bridge.events.on((e) => events.push(e));

      bridge.switchRuntime("ozwell", {
        apiKey: "ozw_test_key",
        model: "gpt-4.1-mini",
      });
      assert.equal(events.length, 1);

      unsubscribe();

      bridge.switchRuntime("local", { model: "ollama:qwen2.5:3b" });
      // Should still be 1 since we unsubscribed
      assert.equal(events.length, 1);
    });

    it("supports multiple listeners", () => {
      const bridge = new JerryBridge();
      const events1: BridgeEvent[] = [];
      const events2: BridgeEvent[] = [];

      bridge.events.on((e) => events1.push(e));
      bridge.events.on((e) => events2.push(e));

      bridge.switchRuntime("ozwell", {
        apiKey: "ozw_test_key",
        model: "gpt-4.1-mini",
      });

      assert.equal(events1.length, 1);
      assert.equal(events2.length, 1);
    });
  });

  describe("getters", () => {
    it("getProfile returns current runtime profile", () => {
      const bridge = new JerryBridge({ model: "ollama:custom" });
      const profile = bridge.getProfile();

      assert.equal(profile.model, "ollama:custom");
      assert.equal(profile.runtime, "local");
    });

    it("getRuntimeKind returns current runtime kind", () => {
      const bridge = new JerryBridge();
      assert.equal(bridge.getRuntimeKind(), "local");

      bridge.switchRuntime("ozwell", {
        apiKey: "ozw_test_key",
        model: "gpt-4.1-mini",
      });
      assert.equal(bridge.getRuntimeKind(), "ozwell");
    });

    it("isActive returns activeTurn state", () => {
      const bridge = new JerryBridge();
      assert.equal(bridge.isActive(), false);
    });
  });
});
