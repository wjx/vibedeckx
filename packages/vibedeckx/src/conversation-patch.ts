/**
 * RFC 6902 JSON Patch utilities for conversation updates
 */

import type { AgentMessage } from "./agent-types.js";

// ============ Patch Operation Types ============

export type PatchOperation = "add" | "replace" | "remove";

export interface PatchEntry {
  op: PatchOperation;
  path: string;
  value?: PatchValue;
}

export type Patch = PatchEntry[];

// ============ Patch Value Types ============

/**
 * PatchType discriminated union
 */
export type PatchValue =
  | { type: "ENTRY"; content: AgentMessage }
  | { type: "STATUS"; content: AgentSessionStatus }
  | { type: "READY"; content: true }
  | { type: "FINISHED"; content: true };

export type AgentSessionStatus = "running" | "stopped" | "error";

// ============ WebSocket Message Format ============

/**
 * Messages sent over WebSocket to frontend
 */
export type AgentWsMessage =
  | { JsonPatch: Patch }
  | { Ready: true }
  | { finished: true }
  | { error: string }
  | { taskCompleted: { duration_ms?: number; cost_usd?: number } };

// ============ Conversation Patch Builder ============

/**
 * ConversationPatch - Static utility for creating RFC 6902 patches
 */
export const ConversationPatch = {
  /**
   * Create an ADD patch for a new entry at the given index
   */
  addEntry(entryIndex: number, entry: AgentMessage): Patch {
    return [
      {
        op: "add",
        path: `/entries/${entryIndex}`,
        value: { type: "ENTRY", content: entry },
      },
    ];
  },

  /**
   * Create a REPLACE patch for updating an existing entry
   */
  replaceEntry(entryIndex: number, entry: AgentMessage): Patch {
    return [
      {
        op: "replace",
        path: `/entries/${entryIndex}`,
        value: { type: "ENTRY", content: entry },
      },
    ];
  },

  /**
   * Create a REMOVE patch for deleting an entry
   */
  removeEntry(entryIndex: number): Patch {
    return [
      {
        op: "remove",
        path: `/entries/${entryIndex}`,
      },
    ];
  },

  /**
   * Create a status update patch
   */
  updateStatus(status: AgentSessionStatus): Patch {
    return [
      {
        op: "replace",
        path: "/status",
        value: { type: "STATUS", content: status },
      },
    ];
  },

  /**
   * Create a patch to clear all entries (for session restart)
   * Uses a special path "/entries" with "replace" to signal full clear
   */
  clearAll(): Patch {
    return [
      {
        op: "replace",
        path: "/entries",
        value: { type: "ENTRY", content: { type: "system", content: "__CLEAR_ALL__", timestamp: Date.now() } as AgentMessage },
      },
    ];
  },
};
