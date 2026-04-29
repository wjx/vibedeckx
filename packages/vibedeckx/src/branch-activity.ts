import type { AgentSession } from "./storage/types.js";

/**
 * Derived activity state per branch. The key sourced of truth for workspace
 * status indicators (idle / working / completed dot color) — see
 * `plans/branch-activity-refactor.md`.
 */
export type BranchActivity = "idle" | "working" | "completed";

export interface BranchActivityState {
  activity: BranchActivity;
  /** Epoch ms of the event that determined this state, or 0 for idle-from-no-events. */
  since: number;
}

/**
 * Compute branch activity by aggregating timestamps across all sessions on each
 * branch:
 *   - working   if max(last_user_message_at) > max(last_completed_at)
 *   - completed if max(last_completed_at) >= max(last_user_message_at) (and any > 0)
 *   - idle      otherwise (no timestamps recorded yet)
 *
 * Aggregation across sessions (rather than picking "the latest session") keeps
 * the derivation correct across "New Conversation": session A may carry the
 * older `last_completed_at`, session B carries a newer `last_user_message_at`,
 * and the branch is correctly classified as "working".
 *
 * Pure function — no side effects, no DB access. Callers pass the AgentSession
 * rows already loaded from storage.
 */
export function computeBranchActivity(
  sessions: AgentSession[]
): Map<string, BranchActivityState> {
  const aggregated = new Map<string, { lastUser: number; lastCompleted: number }>();

  for (const s of sessions) {
    const key = s.branch ?? "";
    const cur = aggregated.get(key) ?? { lastUser: 0, lastCompleted: 0 };
    cur.lastUser = Math.max(cur.lastUser, s.last_user_message_at ?? 0);
    cur.lastCompleted = Math.max(cur.lastCompleted, s.last_completed_at ?? 0);
    aggregated.set(key, cur);
  }

  const result = new Map<string, BranchActivityState>();
  for (const [branch, ts] of aggregated) {
    if (ts.lastUser === 0 && ts.lastCompleted === 0) {
      result.set(branch, { activity: "idle", since: 0 });
    } else if (ts.lastUser > ts.lastCompleted) {
      result.set(branch, { activity: "working", since: ts.lastUser });
    } else {
      result.set(branch, { activity: "completed", since: ts.lastCompleted });
    }
  }
  return result;
}
