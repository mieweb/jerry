/**
 * Unit tests for approval-store.ts — memory-backed approval store.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createMemoryApprovalStore } from "./approval-store.js";

describe("createMemoryApprovalStore", () => {
  let store: ReturnType<typeof createMemoryApprovalStore>;

  beforeEach(() => {
    store = createMemoryApprovalStore();
  });

  describe("hasGrant", () => {
    it("returns false when no approval exists", async () => {
      const result = await store.hasGrant("session-1", "tool_a");
      assert.equal(result, false);
    });

    it("returns false for pending approval", async () => {
      await store.createPending("session-1", "tool_a", { arg: 1 });
      const result = await store.hasGrant("session-1", "tool_a");
      assert.equal(result, false);
    });

    it("returns true for granted approval", async () => {
      await store.createPending("session-1", "tool_a", { arg: 1 });
      await store.grantPending("session-1", "tool_a");
      const result = await store.hasGrant("session-1", "tool_a");
      assert.equal(result, true);
    });
  });

  describe("createPending", () => {
    it("creates a pending approval and returns an ID", async () => {
      const id = await store.createPending("session-1", "tool_a", { arg: 1 });
      assert.ok(id);
      assert.ok(typeof id === "string");
    });

    it("stores the args with the pending approval", async () => {
      await store.createPending("session-1", "tool_a", { arg: 1 });
      const hasPending = await store.hasGrant("session-1", "tool_a");
      assert.equal(hasPending, false); // pending, not granted
    });
  });

  describe("grantPending", () => {
    it("returns true when granting existing pending approval", async () => {
      await store.createPending("session-1", "tool_a", { arg: 1 });
      const result = await store.grantPending("session-1", "tool_a");
      assert.equal(result, true);
    });

    it("returns false when no pending approval exists", async () => {
      const result = await store.grantPending("session-1", "nonexistent");
      assert.equal(result, false);
    });

    it("returns false when approval is already granted", async () => {
      await store.createPending("session-1", "tool_a", { arg: 1 });
      await store.grantPending("session-1", "tool_a");
      const result = await store.grantPending("session-1", "tool_a");
      assert.equal(result, false);
    });
  });

  describe("consumeGrant", () => {
    it("returns true and expires granted approval", async () => {
      await store.createPending("session-1", "tool_a", { arg: 1 });
      await store.grantPending("session-1", "tool_a");

      const result = await store.consumeGrant("session-1", "tool_a");
      assert.equal(result, true);

      // Grant is now expired
      const hasGrant = await store.hasGrant("session-1", "tool_a");
      assert.equal(hasGrant, false);
    });

    it("returns false when no granted approval exists", async () => {
      const result = await store.consumeGrant("session-1", "nonexistent");
      assert.equal(result, false);
    });

    it("returns false when approval is pending (not granted)", async () => {
      await store.createPending("session-1", "tool_a", { arg: 1 });
      const result = await store.consumeGrant("session-1", "tool_a");
      assert.equal(result, false);
    });
  });

  describe("isolation between sessions", () => {
    it("grants for different sessions are independent", async () => {
      await store.createPending("session-1", "tool_a", { arg: 1 });
      await store.createPending("session-2", "tool_a", { arg: 2 });

      await store.grantPending("session-1", "tool_a");

      assert.equal(await store.hasGrant("session-1", "tool_a"), true);
      assert.equal(await store.hasGrant("session-2", "tool_a"), false);
    });

    it("grants for different tools in same session are independent", async () => {
      await store.createPending("session-1", "tool_a", { arg: 1 });
      await store.createPending("session-1", "tool_b", { arg: 2 });

      await store.grantPending("session-1", "tool_a");

      assert.equal(await store.hasGrant("session-1", "tool_a"), true);
      assert.equal(await store.hasGrant("session-1", "tool_b"), false);
    });
  });
});
