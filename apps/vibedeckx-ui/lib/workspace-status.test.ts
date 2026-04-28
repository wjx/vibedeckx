import { describe, it, expect } from "vitest";
import type { Worktree } from "@/lib/api";
import type { AgentSessionStatus } from "./workspace-status";
import {
  type WorkspaceStatus,
  toBranchKey,
  computeWorkspaceStatuses,
  applyStatusWorking,
  applyStatusCompleted,
  clearRealtimeStatus,
  applyGlobalSessionStatus,
} from "./workspace-status";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWorktree(branch: string | null): Worktree {
  return { branch };
}

const emptyRealtime = new Map<string, WorkspaceStatus>();
const emptySessions = new Map<string, AgentSessionStatus>();

// ---------------------------------------------------------------------------
// toBranchKey
// ---------------------------------------------------------------------------

describe("toBranchKey", () => {
  it("converts null to empty string", () => {
    expect(toBranchKey(null)).toBe("");
  });

  it("passes through a regular string", () => {
    expect(toBranchKey("feature-x")).toBe("feature-x");
  });

  it("preserves empty string", () => {
    expect(toBranchKey("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// computeWorkspaceStatuses
// ---------------------------------------------------------------------------

describe("computeWorkspaceStatuses", () => {
  it("undefined worktrees → empty map", () => {
    const result = computeWorkspaceStatuses(undefined, emptyRealtime, emptySessions, null);
    expect(result.size).toBe(0);
  });

  it("no worktrees → empty map", () => {
    const result = computeWorkspaceStatuses([], emptyRealtime, emptySessions, null);
    expect(result.size).toBe(0);
  });

  it("worktree with no realtime, no session → idle", () => {
    const result = computeWorkspaceStatuses(
      [makeWorktree("feat")],
      emptyRealtime,
      emptySessions,
      null
    );
    expect(result.get("feat")).toBe("idle");
  });

  it("worktree with running session (non-selected) → working", () => {
    const sessions = new Map<string, AgentSessionStatus>([["feat", "running"]]);
    const result = computeWorkspaceStatuses(
      [makeWorktree("feat")],
      emptyRealtime,
      sessions,
      "other"
    );
    expect(result.get("feat")).toBe("working");
  });

  it("selected branch ignores polling running status (auto-start sessions)", () => {
    const sessions = new Map<string, AgentSessionStatus>([["feat", "running"]]);
    const result = computeWorkspaceStatuses(
      [makeWorktree("feat")],
      emptyRealtime,
      sessions,
      "feat"
    );
    expect(result.get("feat")).toBe("idle");
  });

  it("realtime working overrides idle session", () => {
    const realtime = new Map<string, WorkspaceStatus>([["feat", "working"]]);
    const result = computeWorkspaceStatuses(
      [makeWorktree("feat")],
      realtime,
      emptySessions,
      "feat"
    );
    expect(result.get("feat")).toBe("working");
  });

  it("realtime completed overrides session", () => {
    const realtime = new Map<string, WorkspaceStatus>([["feat", "completed"]]);
    const sessions = new Map<string, AgentSessionStatus>([["feat", "running"]]);
    const result = computeWorkspaceStatuses(
      [makeWorktree("feat")],
      realtime,
      sessions,
      "other"
    );
    expect(result.get("feat")).toBe("completed");
  });

  it("realtime idle overrides running session", () => {
    const realtime = new Map<string, WorkspaceStatus>([["feat", "idle"]]);
    const sessions = new Map<string, AgentSessionStatus>([["feat", "running"]]);
    const result = computeWorkspaceStatuses(
      [makeWorktree("feat")],
      realtime,
      sessions,
      "other"
    );
    expect(result.get("feat")).toBe("idle");
  });

  it("null branch worktree maps to empty-string key", () => {
    const realtime = new Map<string, WorkspaceStatus>([["", "working"]]);
    const result = computeWorkspaceStatuses(
      [makeWorktree(null)],
      realtime,
      emptySessions,
      null
    );
    expect(result.get("")).toBe("working");
  });

  it("multiple worktrees evaluated independently", () => {
    const worktrees = [
      makeWorktree("feat-a"),
      makeWorktree("feat-b"),
      makeWorktree("feat-c"),
    ];
    const realtime = new Map<string, WorkspaceStatus>([["feat-a", "completed"]]);
    const sessions = new Map<string, AgentSessionStatus>([["feat-b", "running"]]);
    const result = computeWorkspaceStatuses(worktrees, realtime, sessions, "feat-c");

    expect(result.get("feat-a")).toBe("completed");
    expect(result.get("feat-b")).toBe("working");
    expect(result.get("feat-c")).toBe("idle");
  });
});

// ---------------------------------------------------------------------------
// applyStatusWorking
// ---------------------------------------------------------------------------

describe("applyStatusWorking", () => {
  it("sets working for a branch", () => {
    const result = applyStatusWorking(new Map(), "feat");
    expect(result.get("feat")).toBe("working");
  });

  it("handles null branch (maps to '')", () => {
    const result = applyStatusWorking(new Map(), null);
    expect(result.get("")).toBe("working");
  });

  it("does not mutate original map", () => {
    const original = new Map<string, WorkspaceStatus>([["feat", "idle"]]);
    const result = applyStatusWorking(original, "feat");
    expect(result.get("feat")).toBe("working");
    expect(original.get("feat")).toBe("idle");
  });

  it("overwrites existing status", () => {
    const prev = new Map<string, WorkspaceStatus>([["feat", "completed"]]);
    const result = applyStatusWorking(prev, "feat");
    expect(result.get("feat")).toBe("working");
  });
});

// ---------------------------------------------------------------------------
// applyStatusCompleted
// ---------------------------------------------------------------------------

describe("applyStatusCompleted", () => {
  it("sets completed for a branch", () => {
    const result = applyStatusCompleted(new Map(), "feat");
    expect(result.get("feat")).toBe("completed");
  });

  it("overwrites existing status", () => {
    const prev = new Map<string, WorkspaceStatus>([["feat", "working"]]);
    const result = applyStatusCompleted(prev, "feat");
    expect(result.get("feat")).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// clearRealtimeStatus
// ---------------------------------------------------------------------------

describe("clearRealtimeStatus", () => {
  it("removes entry for a branch", () => {
    const prev = new Map<string, WorkspaceStatus>([["feat", "working"]]);
    const result = clearRealtimeStatus(prev, "feat");
    expect(result.has("feat")).toBe(false);
  });

  it("no-op if branch is absent", () => {
    const prev = new Map<string, WorkspaceStatus>([["other", "working"]]);
    const result = clearRealtimeStatus(prev, "feat");
    expect(result.size).toBe(1);
    expect(result.get("other")).toBe("working");
  });

  it("handles null branch", () => {
    const prev = new Map<string, WorkspaceStatus>([["", "completed"]]);
    const result = clearRealtimeStatus(prev, null);
    expect(result.has("")).toBe(false);
  });

  it("does not mutate original map", () => {
    const original = new Map<string, WorkspaceStatus>([["feat", "working"]]);
    clearRealtimeStatus(original, "feat");
    expect(original.get("feat")).toBe("working");
  });
});

// ---------------------------------------------------------------------------
// applyGlobalSessionStatus
// ---------------------------------------------------------------------------

describe("applyGlobalSessionStatus", () => {
  it("running → sets working", () => {
    const result = applyGlobalSessionStatus(new Map(), "feat", "running");
    expect(result.get("feat")).toBe("working");
  });

  it("stopped → clears entry", () => {
    const prev = new Map<string, WorkspaceStatus>([["feat", "working"]]);
    const result = applyGlobalSessionStatus(prev, "feat", "stopped");
    expect(result.has("feat")).toBe(false);
  });

  it("stopped → preserves completed (taskCompleted-then-stopped race)", () => {
    const prev = new Map<string, WorkspaceStatus>([["feat", "completed"]]);
    const result = applyGlobalSessionStatus(prev, "feat", "stopped");
    expect(result.get("feat")).toBe("completed");
  });

  it("error → clears entry even if completed", () => {
    const prev = new Map<string, WorkspaceStatus>([["feat", "completed"]]);
    const result = applyGlobalSessionStatus(prev, "feat", "error");
    expect(result.has("feat")).toBe(false);
  });

  it("error → clears entry", () => {
    const prev = new Map<string, WorkspaceStatus>([["feat", "working"]]);
    const result = applyGlobalSessionStatus(prev, "feat", "error");
    expect(result.has("feat")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Event sequence simulations
// ---------------------------------------------------------------------------

describe("event sequence simulations", () => {
  const worktrees = [makeWorktree("feat-a"), makeWorktree("feat-b")];

  it("send message → working", () => {
    let realtime = applyStatusWorking(new Map(), "feat-a");
    const result = computeWorkspaceStatuses(worktrees, realtime, emptySessions, "feat-a");
    expect(result.get("feat-a")).toBe("working");
  });

  it("taskCompleted → stopped (selected branch, no task) → completed (green survives)", () => {
    let realtime = applyStatusWorking(new Map(), "feat-a");
    realtime = applyStatusCompleted(realtime, "feat-a");
    realtime = applyGlobalSessionStatus(realtime, "feat-a", "stopped");

    const result = computeWorkspaceStatuses(worktrees, realtime, emptySessions, "feat-a");
    expect(result.get("feat-a")).toBe("completed");
  });

  it("user clicks New Conversation → realtime cleared → idle", () => {
    let realtime = applyStatusCompleted(new Map(), "feat-a");
    // simulating handleNewConversation in page.tsx
    realtime = clearRealtimeStatus(realtime, "feat-a");

    const result = computeWorkspaceStatuses(worktrees, realtime, emptySessions, "feat-a");
    expect(result.get("feat-a")).toBe("idle");
  });

  it("session stopped without completion → idle", () => {
    let realtime = applyStatusWorking(new Map(), "feat-a");
    realtime = applyGlobalSessionStatus(realtime, "feat-a", "stopped");

    const result = computeWorkspaceStatuses(worktrees, realtime, emptySessions, "feat-a");
    expect(result.get("feat-a")).toBe("idle");
  });

  it("session error → idle", () => {
    let realtime = applyStatusWorking(new Map(), "feat-a");
    realtime = applyGlobalSessionStatus(realtime, "feat-a", "error");

    const result = computeWorkspaceStatuses(worktrees, realtime, emptySessions, "feat-a");
    expect(result.get("feat-a")).toBe("idle");
  });

  it("non-selected branch starts running via SSE → working", () => {
    let realtime = applyGlobalSessionStatus(new Map(), "feat-b", "running");
    const result = computeWorkspaceStatuses(worktrees, realtime, emptySessions, "feat-a");
    expect(result.get("feat-b")).toBe("working");
  });

  it("page reload (empty realtime) + non-selected branch session running → working", () => {
    const sessions = new Map<string, AgentSessionStatus>([["feat-b", "running"]]);
    const result = computeWorkspaceStatuses(worktrees, emptyRealtime, sessions, "feat-a");
    expect(result.get("feat-b")).toBe("working");
  });

  it("page reload (empty realtime) → all idle when no sessions running", () => {
    const result = computeWorkspaceStatuses(worktrees, emptyRealtime, emptySessions, "feat-a");
    expect(result.get("feat-a")).toBe("idle");
    expect(result.get("feat-b")).toBe("idle");
  });

  it("multiple events same branch (working → completed → working)", () => {
    let realtime = applyStatusWorking(new Map(), "feat-a");
    expect(realtime.get("feat-a")).toBe("working");

    realtime = applyStatusCompleted(realtime, "feat-a");
    expect(realtime.get("feat-a")).toBe("completed");

    realtime = applyStatusWorking(realtime, "feat-a");
    expect(realtime.get("feat-a")).toBe("working");
  });
});
