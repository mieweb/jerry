/**
 * Wrap tools with ask-disposition approval flow.
 *
 * Under egress: "allow-tools", tools with "ask" disposition require
 * human-in-the-loop approval before execution. This module wraps each
 * tool's execute function to check approval state and suspend if needed.
 */

import type { Tool, ToolSet } from "ai";
import type { ToolContext, ToolEgress } from "./types.js";

/**
 * Result returned when a tool is waiting for approval.
 */
export interface WaitingForApprovalResult {
  status: "waiting_for_approval";
  toolName: string;
  message: string;
}

/**
 * Wrap a single tool with ask-disposition approval flow.
 *
 * @param name - Tool name
 * @param tool - Original tool
 * @param ctx - Tool context with approval store and suspend hooks
 * @param disposition - Tool's egress disposition
 * @returns Wrapped tool (or original if no wrapping needed)
 */
export function wrapToolWithAsk<T extends Tool>(
  name: string,
  tool: T,
  ctx: ToolContext,
  disposition: ToolEgress | undefined
): T {
  if (disposition !== "ask") {
    return tool;
  }

  if (!ctx.approvalStore) {
    return tool;
  }

  const originalExecute = tool.execute;
  if (!originalExecute) {
    return tool;
  }

  const wrappedExecute = async (args: unknown, options: unknown) => {
    const { sessionId, approvalStore, suspendForApproval } = ctx;

    const hasGrant = await approvalStore!.hasGrant(sessionId, name);

    if (hasGrant) {
      const consumed = await approvalStore!.consumeGrant(sessionId, name);
      if (consumed) {
        return originalExecute(args, options as Parameters<typeof originalExecute>[1]);
      }
    }

    const argsPreview = JSON.stringify(args, null, 2).slice(0, 200);
    const message = `Tool "${name}" requires approval.\n\nArguments:\n${argsPreview}\n\nReply to approve and continue.`;

    await approvalStore!.createPending(sessionId, name, args);
    suspendForApproval(message);

    return {
      status: "waiting_for_approval",
      toolName: name,
      message: `Waiting for approval to execute ${name}`,
    } satisfies WaitingForApprovalResult;
  };

  return {
    ...tool,
    execute: wrappedExecute,
  } as T;
}

/**
 * Wrap all tools in a ToolSet with ask-disposition approval flow.
 *
 * @param tools - Original ToolSet
 * @param ctx - Tool context with approval store and suspend hooks
 * @returns Wrapped ToolSet
 */
export function wrapToolsWithAsk(
  tools: ToolSet,
  ctx: ToolContext
): ToolSet {
  const dispositions = ctx.dispositions ?? {};

  const wrapped: ToolSet = {};
  for (const [name, tool] of Object.entries(tools)) {
    const disposition = dispositions[name];
    wrapped[name] = wrapToolWithAsk(name, tool, ctx, disposition);
  }

  return wrapped;
}
