/**
 * Type definitions for runtime tools.
 */

import type { CloudDatabase, CloudVectorIndex, CloudBucket } from "@mieweb/cloud-types";

/**
 * Per-tool egress disposition (mirrors agent-runtime types).
 * - `local`: Tool runs locally, no network access.
 * - `ask`: Tool may reach out, but requires human-in-the-loop approval first.
 * - `allow`: Tool may reach out without approval.
 */
export type ToolEgress = "local" | "ask" | "allow";

/**
 * Approval store interface for persisting pending tool approvals.
 */
export interface ApprovalStore {
  /** Check if a tool has a valid grant for this session */
  hasGrant(sessionId: string, toolName: string): Promise<boolean>;
  /** Create a pending approval request */
  createPending(sessionId: string, toolName: string, args: unknown): Promise<string>;
  /** Grant approval (mark pending as granted) */
  grantPending(sessionId: string, toolName: string): Promise<boolean>;
  /** Consume a grant (use once then clear) */
  consumeGrant(sessionId: string, toolName: string): Promise<boolean>;
}

/**
 * Context passed to tools during execution.
 * Contains bindings and control functions.
 */
export interface ToolContext {
  /** Current session ID */
  sessionId: string;
  /** Database binding for queries */
  db: CloudDatabase;
  /** Vector index for semantic search (optional) */
  vectors?: CloudVectorIndex;
  /** Object storage for files (optional) */
  bucket?: CloudBucket;
  /** Schedule a future wake-up (DO alarm) */
  scheduleWake: (at: Date | string, payload?: unknown) => Promise<void>;
  /** Suspend waiting for user input */
  suspendForUser: (message: string) => void;
  /** Suspend waiting for approval */
  suspendForApproval: (message: string) => void;
  /** Per-tool egress dispositions from profile (optional) */
  dispositions?: Record<string, ToolEgress>;
  /** Approval store for ask-disposition tools (optional) */
  approvalStore?: ApprovalStore;
}

/**
 * Activity event from the database (collector-pushed).
 */
export interface StoredActivityEvent {
  id: string;
  source: string;
  payload: unknown;
  occurredAt: string;
}
