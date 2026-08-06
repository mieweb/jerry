/**
 * Type definitions for runtime tools.
 */

import type { CloudDatabase, CloudVectorIndex, CloudBucket } from "@mieweb/cloud-types";

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
