/**
 * Unit tests for wrap-ask.ts — ask-disposition approval flow.
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { tool } from "ai";
import { wrapToolWithAsk, wrapToolsWithAsk } from "./wrap-ask.js";
import type { ToolContext, ApprovalStore, ToolEgress } from "./types.js";

const makeTool = (name: string, execute: (args: unknown) => Promise<string>) =>
  tool({
    description: `Test tool: ${name}`,
    parameters: z.object({ input: z.string().optional() }),
    execute,
  });

function createMemoryApprovalStore(): ApprovalStore & {
  approvals: Map<string, { status: string; args: unknown }>;
} {
  const approvals = new Map<string, { status: string; args: unknown }>();
  const key = (sessionId: string, toolName: string) =>
    `${sessionId}:${toolName}`;

  return {
    approvals,
    async hasGrant(sessionId: string, toolName: string): Promise<boolean> {
      const entry = approvals.get(key(sessionId, toolName));
      return entry?.status === "granted";
    },
    async createPending(
      sessionId: string,
      toolName: string,
      args: unknown
    ): Promise<string> {
      const id = crypto.randomUUID();
      approvals.set(key(sessionId, toolName), { status: "pending", args });
      return id;
    },
    async grantPending(sessionId: string, toolName: string): Promise<boolean> {
      const entry = approvals.get(key(sessionId, toolName));
      if (entry?.status === "pending") {
        entry.status = "granted";
        return true;
      }
      return false;
    },
    async consumeGrant(sessionId: string, toolName: string): Promise<boolean> {
      const entry = approvals.get(key(sessionId, toolName));
      if (entry?.status === "granted") {
        entry.status = "expired";
        return true;
      }
      return false;
    },
  };
}

function createMockContext(
  dispositions?: Record<string, ToolEgress>,
  approvalStore?: ApprovalStore
): ToolContext {
  let suspendMessage: string | null = null;

  return {
    sessionId: "test-session",
    db: {} as ToolContext["db"],
    scheduleWake: async () => {},
    suspendForUser: () => {},
    suspendForApproval: (message: string) => {
      suspendMessage = message;
    },
    dispositions,
    approvalStore,
    get _suspendMessage() {
      return suspendMessage;
    },
  } as ToolContext & { _suspendMessage: string | null };
}

describe("wrapToolWithAsk", () => {
  let executeCalled = false;
  let store: ReturnType<typeof createMemoryApprovalStore>;

  beforeEach(() => {
    executeCalled = false;
    store = createMemoryApprovalStore();
  });

  it("does not wrap tools with 'local' disposition", async () => {
    const originalTool = makeTool("local_tool", async () => {
      executeCalled = true;
      return "result";
    });
    const ctx = createMockContext({ local_tool: "local" }, store);

    const wrapped = wrapToolWithAsk("local_tool", originalTool, ctx, "local");
    const result = await wrapped.execute?.({ input: "test" }, {} as never);

    assert.equal(executeCalled, true);
    assert.equal(result, "result");
  });

  it("does not wrap tools with 'allow' disposition", async () => {
    const originalTool = makeTool("allow_tool", async () => {
      executeCalled = true;
      return "result";
    });
    const ctx = createMockContext({ allow_tool: "allow" }, store);

    const wrapped = wrapToolWithAsk("allow_tool", originalTool, ctx, "allow");
    const result = await wrapped.execute?.({ input: "test" }, {} as never);

    assert.equal(executeCalled, true);
    assert.equal(result, "result");
  });

  it("suspends execution for 'ask' disposition without grant", async () => {
    const originalTool = makeTool("ask_tool", async () => {
      executeCalled = true;
      return "result";
    });
    const ctx = createMockContext({ ask_tool: "ask" }, store);

    const wrapped = wrapToolWithAsk("ask_tool", originalTool, ctx, "ask");
    const result = (await wrapped.execute?.(
      { input: "test" },
      {} as never
    )) as { status: string };

    assert.equal(executeCalled, false);
    assert.equal(result?.status, "waiting_for_approval");
    assert.ok(store.approvals.has("test-session:ask_tool"));
    assert.equal(store.approvals.get("test-session:ask_tool")?.status, "pending");
  });

  it("executes tool after grant is consumed", async () => {
    const originalTool = makeTool("ask_tool", async () => {
      executeCalled = true;
      return "approved result";
    });
    const ctx = createMockContext({ ask_tool: "ask" }, store);

    // Pre-grant the tool
    await store.createPending("test-session", "ask_tool", {});
    await store.grantPending("test-session", "ask_tool");

    const wrapped = wrapToolWithAsk("ask_tool", originalTool, ctx, "ask");
    const result = await wrapped.execute?.({ input: "test" }, {} as never);

    assert.equal(executeCalled, true);
    assert.equal(result, "approved result");
    assert.equal(store.approvals.get("test-session:ask_tool")?.status, "expired");
  });

  it("returns original tool if no approval store provided", async () => {
    const originalTool = makeTool("ask_tool", async () => {
      executeCalled = true;
      return "no store result";
    });
    const ctx = createMockContext({ ask_tool: "ask" }, undefined);

    const wrapped = wrapToolWithAsk("ask_tool", originalTool, ctx, "ask");
    const result = await wrapped.execute?.({ input: "test" }, {} as never);

    assert.equal(executeCalled, true);
    assert.equal(result, "no store result");
  });
});

describe("wrapToolsWithAsk", () => {
  it("wraps multiple tools based on dispositions", async () => {
    const store = createMemoryApprovalStore();
    let localExecuted = false;
    let askExecuted = false;

    const tools = {
      local_tool: makeTool("local_tool", async () => {
        localExecuted = true;
        return "local";
      }),
      ask_tool: makeTool("ask_tool", async () => {
        askExecuted = true;
        return "ask";
      }),
    };

    const ctx = createMockContext(
      { local_tool: "local", ask_tool: "ask" },
      store
    );

    const wrapped = wrapToolsWithAsk(tools, ctx);

    // Local tool executes immediately
    await wrapped.local_tool.execute?.({}, {} as never);
    assert.equal(localExecuted, true);

    // Ask tool suspends
    const askResult = (await wrapped.ask_tool.execute?.(
      {},
      {} as never
    )) as { status: string };
    assert.equal(askExecuted, false);
    assert.equal(askResult?.status, "waiting_for_approval");
  });

  it("handles tools without dispositions in context", async () => {
    const store = createMemoryApprovalStore();
    let executed = false;

    const tools = {
      unknown_tool: makeTool("unknown_tool", async () => {
        executed = true;
        return "unknown";
      }),
    };

    const ctx = createMockContext(undefined, store);

    const wrapped = wrapToolsWithAsk(tools, ctx);
    await wrapped.unknown_tool.execute?.({}, {} as never);

    assert.equal(executed, true);
  });
});
