import type { AgentSession } from "./storage/types.js";

/**
 * Derived activity state per branch. The single source of truth for
 * workspace status indicators (idle / working / completed dot color) — see
 * `plans/branch-activity-refactor.md`.
 */
export type BranchActivity = "idle" | "working" | "completed" | "stopped";

export interface BranchActivityState {
  activity: BranchActivity;
  /** Epoch ms of the event that determined this state, or 0 for idle-from-no-events. */
  since: number;
}

/**
 * Compute branch activity from agent_sessions. For each branch, picks the
 * session with the most recent `updated_at` and derives the state from its
 * timestamps + status:
 *   - working   if status === "running" AND last_user_message_at > (last_completed_at ?? 0)
 *   - stopped   if status !== "running" AND last_user_message_at > (last_completed_at ?? 0)
 *               (user clicked Stop, or process errored mid-turn)
 *   - completed if last_completed_at >= last_user_message_at (and any > 0)
 *   - idle      no timestamps yet (fresh session, never received any messages)
 *
 * `stopped` exists as a distinct state from `idle` so the sidebar dot can
 * surface "you abandoned work here, come back to it" — visually different
 * from a fresh workspace that never had any activity.
 *
 * Picking the latest session (rather than aggregating across all sessions)
 * gives "New Conversation" the correct reset semantics: creating a fresh
 * session bumps `updated_at`, the new session has no timestamps, and the
 * branch correctly reports idle. Older sessions' completed state on the same
 * branch doesn't bleed forward.
 *
 * `updated_at` is touched by user messages (via `persistEntry`/`touchUpdatedAt`)
 * but intentionally NOT by `markCompleted` — so a session that's "completed"
 * stays the latest until the user starts a new conversation or messages a
 * different session.
 *
 * Pure function — no side effects, no DB access. Callers pass the AgentSession
 * rows already loaded from storage.
 */
export function computeBranchActivity(
  sessions: AgentSession[]
): Map<string, BranchActivityState> {
  const latestByBranch = new Map<string, AgentSession>();

  for (const s of sessions) {
    const key = s.branch ?? "";
    const prev = latestByBranch.get(key);
    if (!prev || compareUpdatedAt(s, prev) > 0) {
      latestByBranch.set(key, s);
    }
  }

  const result = new Map<string, BranchActivityState>();
  for (const [branch, s] of latestByBranch) {
    const lastUser = s.last_user_message_at ?? 0;
    const lastCompleted = s.last_completed_at ?? 0;
    if (lastUser === 0 && lastCompleted === 0) {
      result.set(branch, { activity: "idle", since: 0 });
    } else if (lastUser > lastCompleted) {
      if (s.status === "running") {
        result.set(branch, { activity: "working", since: lastUser });
      } else {
        result.set(branch, { activity: "stopped", since: lastUser });
      }
    } else {
      result.set(branch, { activity: "completed", since: lastCompleted });
    }
  }
  return result;
}

/**
 * Compare two sessions by `updated_at` (the millisecond-precision text format
 * is lex-sortable by design — see the schema comment in sqlite.ts). Falls back
 * to `created_at` when updated_at is missing on legacy rows.
 */
function compareUpdatedAt(a: AgentSession, b: AgentSession): number {
  const aTs = a.updated_at ?? a.created_at;
  const bTs = b.updated_at ?? b.created_at;
  if (aTs < bTs) return -1;
  if (aTs > bTs) return 1;
  return 0;
}
