/**
 * Database-backed approval store for tool call approvals.
 *
 * Persists pending tool approvals and grants to the tool_approvals table.
 * Used by the ask-disposition flow to require human approval before
 * executing tools that may reach out to external services.
 */

import type { ApprovalStore, ToolContext } from "@mieweb/jerry-tools/runtime";

type CloudDatabase = ToolContext["db"];

/**
 * Create a database-backed approval store.
 *
 * @param db - Cloud database binding
 * @returns ApprovalStore implementation
 */
export function createDbApprovalStore(db: CloudDatabase): ApprovalStore {
  return {
    async hasGrant(sessionId: string, toolName: string): Promise<boolean> {
      const result = await db
        .prepare(
          `SELECT id FROM tool_approvals
           WHERE session_id = ? AND tool_name = ? AND status = 'granted'
           LIMIT 1`
        )
        .bind(sessionId, toolName)
        .first<{ id: string }>();

      return result !== null;
    },

    async createPending(
      sessionId: string,
      toolName: string,
      args: unknown
    ): Promise<string> {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const argsJson = JSON.stringify(args);

      await db
        .prepare(
          `INSERT INTO tool_approvals (id, session_id, tool_name, args_json, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'pending', ?, ?)`
        )
        .bind(id, sessionId, toolName, argsJson, now, now)
        .run();

      return id;
    },

    async grantPending(sessionId: string, toolName: string): Promise<boolean> {
      const now = new Date().toISOString();

      const result = await db
        .prepare(
          `UPDATE tool_approvals
           SET status = 'granted', updated_at = ?
           WHERE session_id = ? AND tool_name = ? AND status = 'pending'`
        )
        .bind(now, sessionId, toolName)
        .run();

      return (result.meta?.changes ?? 0) > 0;
    },

    async consumeGrant(sessionId: string, toolName: string): Promise<boolean> {
      const now = new Date().toISOString();

      const result = await db
        .prepare(
          `UPDATE tool_approvals
           SET status = 'expired', updated_at = ?
           WHERE session_id = ? AND tool_name = ? AND status = 'granted'`
        )
        .bind(now, sessionId, toolName)
        .run();

      return (result.meta?.changes ?? 0) > 0;
    },
  };
}

/**
 * In-memory approval store for testing.
 */
export function createMemoryApprovalStore(): ApprovalStore {
  const approvals = new Map<string, { status: string; args: unknown }>();

  const key = (sessionId: string, toolName: string) =>
    `${sessionId}:${toolName}`;

  return {
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
