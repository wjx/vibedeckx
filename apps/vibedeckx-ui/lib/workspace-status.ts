import type { Worktree } from "@/lib/api";

export type WorkspaceStatus = "idle" | "working" | "completed";

/** Session status values from polling. Duplicated here to avoid importing from a React hook file. */
export type AgentSessionStatus = "running" | "stopped" | "error";

/** Normalize null branch (main worktree) to empty string for Map keys. */
export function toBranchKey(branch: string | null): string {
  return branch === null ? "" : branch;
}

/**
 * Compute workspace statuses for all worktrees.
 *
 * Two-tier fallback:
 * 1. Realtime statuses (event-driven, highest priority)
 * 2. Session polling status
 *
 * The selected branch's polling status is ignored because auto-start creates
 * idle "running" sessions on the selected branch.
 */
export function computeWorkspaceStatuses(
  worktrees: Worktree[] | undefined,
  realtimeStatuses: Map<string, WorkspaceStatus>,
  sessionStatuses: Map<string, AgentSessionStatus>,
  selectedBranch: string | null
): Map<string, WorkspaceStatus> {
  const map = new Map<string, WorkspaceStatus>();
  if (!worktrees) return map;

  const selectedKey = toBranchKey(selectedBranch);

  for (const wt of worktrees) {
    const branchKey = toBranchKey(wt.branch);

    const realtimeStatus = realtimeStatuses.get(branchKey);
    if (realtimeStatus !== undefined) {
      map.set(branchKey, realtimeStatus);
      continue;
    }

    const sessionStatus =
      branchKey === selectedKey ? undefined : sessionStatuses.get(branchKey);
    map.set(branchKey, sessionStatus === "running" ? "working" : "idle");
  }
  return map;
}

/** Set a branch's realtime status to "working". */
export function applyStatusWorking(
  prev: Map<string, WorkspaceStatus>,
  branch: string | null
): Map<string, WorkspaceStatus> {
  const next = new Map(prev);
  next.set(toBranchKey(branch), "working");
  return next;
}

/** Set a branch's realtime status to "completed". */
export function applyStatusCompleted(
  prev: Map<string, WorkspaceStatus>,
  branch: string | null
): Map<string, WorkspaceStatus> {
  const next = new Map(prev);
  next.set(toBranchKey(branch), "completed");
  return next;
}

/** Remove a branch's realtime status so the session-polling fallback takes over. */
export function clearRealtimeStatus(
  prev: Map<string, WorkspaceStatus>,
  branch: string | null
): Map<string, WorkspaceStatus> {
  const next = new Map(prev);
  next.delete(toBranchKey(branch));
  return next;
}

/**
 * Apply a global session status event.
 * - "running" → set realtime "working"
 * - "stopped" → preserve "completed" (backend emits stopped right after
 *   taskCompleted; clearing would erase the green dot), otherwise clear
 * - "error" → clear realtime entry
 */
export function applyGlobalSessionStatus(
  prev: Map<string, WorkspaceStatus>,
  branch: string | null,
  status: AgentSessionStatus
): Map<string, WorkspaceStatus> {
  if (status === "running") {
    return applyStatusWorking(prev, branch);
  }
  if (status === "stopped" && prev.get(toBranchKey(branch)) === "completed") {
    return prev;
  }
  return clearRealtimeStatus(prev, branch);
}
