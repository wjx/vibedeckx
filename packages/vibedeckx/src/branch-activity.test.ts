import { describe, it, expect } from "vitest";
import type { AgentSession } from "./storage/types.js";
import { computeBranchActivity } from "./branch-activity.js";

function session(opts: Partial<AgentSession> & { branch: string; id?: string }): AgentSession {
  return {
    id: opts.id ?? "sess-" + Math.random().toString(36).slice(2, 8),
    project_id: "proj-1",
    branch: opts.branch,
    status: opts.status ?? "running",
    created_at: opts.created_at ?? "2026-01-01 00:00:00.000",
    last_user_message_at: opts.last_user_message_at ?? null,
    last_completed_at: opts.last_completed_at ?? null,
  };
}

describe("computeBranchActivity", () => {
  it("no sessions → empty map", () => {
    expect(computeBranchActivity([]).size).toBe(0);
  });

  // ---- The four state-machine transitions ----------------------------------

  it("session with no timestamps → idle", () => {
    const result = computeBranchActivity([session({ branch: "feat-a" })]);
    expect(result.get("feat-a")).toEqual({ activity: "idle", since: 0 });
  });

  it("user_message_at > completed_at (or completed_at null) → working", () => {
    const result = computeBranchActivity([
      session({ branch: "feat-a", last_user_message_at: 1000, last_completed_at: null }),
    ]);
    expect(result.get("feat-a")).toEqual({ activity: "working", since: 1000 });
  });

  it("completed_at > user_message_at → completed", () => {
    const result = computeBranchActivity([
      session({ branch: "feat-a", last_user_message_at: 1000, last_completed_at: 2000 }),
    ]);
    expect(result.get("feat-a")).toEqual({ activity: "completed", since: 2000 });
  });

  it("user message after completion → working again", () => {
    const result = computeBranchActivity([
      session({ branch: "feat-a", last_user_message_at: 3000, last_completed_at: 2000 }),
    ]);
    expect(result.get("feat-a")).toEqual({ activity: "working", since: 3000 });
  });

  // ---- Edge cases ----------------------------------------------------------

  it("equal user_message_at and completed_at → completed (completion wins on tie)", () => {
    // Defensive: completion timestamp is written AFTER the user message of the
    // same turn, so on tie we treat it as completed. Actual tie is unlikely
    // since timestamps are millisecond-precision.
    const result = computeBranchActivity([
      session({ branch: "feat-a", last_user_message_at: 1000, last_completed_at: 1000 }),
    ]);
    expect(result.get("feat-a")?.activity).toBe("completed");
  });

  it("aggregates across sessions on the same branch (New Conversation)", () => {
    // Session A: completed earlier. Session B (newer): user just messaged.
    // Branch should be "working" because B's user-message is newer than A's
    // completion.
    const result = computeBranchActivity([
      session({ id: "A", branch: "feat-a", last_user_message_at: 1000, last_completed_at: 2000 }),
      session({ id: "B", branch: "feat-a", last_user_message_at: 3000, last_completed_at: null }),
    ]);
    expect(result.get("feat-a")).toEqual({ activity: "working", since: 3000 });
  });

  it("aggregates across sessions: older user msg, newer completion → completed", () => {
    const result = computeBranchActivity([
      session({ id: "A", branch: "feat-a", last_user_message_at: 5000, last_completed_at: null }),
      session({ id: "B", branch: "feat-a", last_user_message_at: null, last_completed_at: 6000 }),
    ]);
    expect(result.get("feat-a")).toEqual({ activity: "completed", since: 6000 });
  });

  it("multiple branches → independent states", () => {
    const result = computeBranchActivity([
      session({ branch: "feat-a", last_user_message_at: 1000 }),
      session({ branch: "feat-b", last_user_message_at: 1000, last_completed_at: 2000 }),
      session({ branch: "feat-c" }),
    ]);
    expect(result.get("feat-a")?.activity).toBe("working");
    expect(result.get("feat-b")?.activity).toBe("completed");
    expect(result.get("feat-c")?.activity).toBe("idle");
  });

  it("null branch → keyed by empty string", () => {
    const result = computeBranchActivity([
      session({ branch: null as unknown as string, last_user_message_at: 1000 }),
    ]);
    expect(result.get("")?.activity).toBe("working");
  });

  it("treats undefined/null timestamp fields as 0", () => {
    // Defends against the storage layer emitting `undefined` instead of `null`
    // (e.g. better-sqlite3 returns undefined for missing optional columns in
    // some configurations).
    const s: AgentSession = {
      id: "x",
      project_id: "p",
      branch: "feat-a",
      status: "running",
      created_at: "2026-01-01 00:00:00.000",
      // last_user_message_at and last_completed_at intentionally omitted
    };
    expect(computeBranchActivity([s]).get("feat-a")?.activity).toBe("idle");
  });
});
