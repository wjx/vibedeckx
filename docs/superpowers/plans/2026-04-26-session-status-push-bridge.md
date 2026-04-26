# Session Status Push Bridge — Reduce Polling, Fix Remote Gap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the load and noise of `/api/projects/:id/agent-sessions` polling by raising its interval from 5s to 30s, and close the gap where remote sessions never publish `session:status` events on the local SSE stream.

**Architecture:** The frontend already consumes a server-sent-events stream (`/api/events`) via `useGlobalEvents`, which is the primary data source for sidebar workspace status indicators. The 5s polling in `useSessionStatuses` is a drift-correction safety net for SSE gaps (network blips, backend restart, missed events). Two changes:
1. **Frontend** — extend the polling interval to 30s and document it as a safety net only.
2. **Backend** — when a remote agent session forwards a `/status` JsonPatch through the WebSocket proxy, also re-emit it on the local `eventBus` so `/api/events` SSE delivers it. This mirrors how `taskCompleted` is already bridged.

**Tech Stack:** Next.js 16 + React 19 (frontend), Fastify + ws (backend), TypeScript ESM, Vitest for frontend tests (no backend test framework — backend changes are verified manually via dev logs).

---

## File Structure

**Modify:**
- `apps/vibedeckx-ui/hooks/use-session-statuses.ts` — raise interval from 5000 → 30000ms, add comment documenting the safety-net role.
- `packages/vibedeckx/src/routes/websocket-routes.ts` — inside `handleLiveMessage`, when the incoming JsonPatch contains a `/status` op, emit a `session:status` event on the local `eventBus`.

**Create:**
- `packages/vibedeckx/src/routes/remote-status-bridge.ts` — small pure helper that extracts a `session:status` event payload from a parsed remote JsonPatch message. Pure so the logic is testable with vitest in the frontend test runner (or, if we add backend tests later, easily ported).

**Test:**
- No new test files. The frontend interval is configuration; the backend bridge is verified by dev-server smoke test (instructions in Task 4). We could add a vitest config to `packages/vibedeckx/`, but that is scope creep for a 10-line helper.

---

## Task 1: Slow down session status polling to 30s

**Files:**
- Modify: `apps/vibedeckx-ui/hooks/use-session-statuses.ts:21-57`

**Why:** `useGlobalEvents` (SSE) is the primary source for sidebar status. Polling exists only as drift-correction for SSE gaps. 5s is overkill given each event also separately triggers `refetchSessionStatuses()` from `app/page.tsx` handlers.

- [ ] **Step 1: Update the comment block and rename interval to a constant**

Replace lines 21-24 (the JSDoc) with the following, and add a `POLL_INTERVAL_MS` constant just below the imports:

```typescript
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getAuthToken } from "@/lib/api";
import type { AgentSessionStatus } from "./use-agent-session";

/**
 * Drift-correction safety net for sidebar workspace status indicators.
 *
 * The primary status source is the SSE stream `/api/events` (see
 * `useGlobalEvents`). This poll exists only to repair drift if SSE missed an
 * event during a reconnect window or backend restart. Event-driven handlers in
 * `app/page.tsx` also call `refetch()` on every status event, so the interval
 * itself can be coarse.
 */
const POLL_INTERVAL_MS = 30_000;

function getApiBase(): string {
```

- [ ] **Step 2: Use the constant in `setInterval`**

Replace:

```typescript
intervalRef.current = setInterval(fetchStatuses, 5000);
```

with:

```typescript
intervalRef.current = setInterval(fetchStatuses, POLL_INTERVAL_MS);
```

- [ ] **Step 3: Type-check the frontend**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run existing tests**

Run: `cd apps/vibedeckx-ui && npx vitest run`
Expected: all existing tests pass (this change does not affect any tested surface).

- [ ] **Step 5: Commit**

```bash
git add apps/vibedeckx-ui/hooks/use-session-statuses.ts
git commit -m "perf(ui): slow workspace status polling to 30s

SSE via useGlobalEvents is the primary source; polling is now drift
correction only."
```

---

## Task 2: Add a pure helper to parse remote status patches

**Files:**
- Create: `packages/vibedeckx/src/routes/remote-status-bridge.ts`

**Why:** Keeps the side-effect-free parsing logic separate from the WebSocket handler so it stays small and is easy to reason about. Also avoids duplicating the `projectId` slicing logic that already lives inline at `websocket-routes.ts:151-155`.

- [ ] **Step 1: Create the helper file**

```typescript
import type { GlobalEvent } from "../event-bus.js";
import type { RemoteSessionInfo } from "../server-types.js";

type AgentSessionStatus = "running" | "stopped" | "error";

/**
 * Extract the projectId from a synthetic remote session id.
 *
 * Remote session ids are formatted `remote-{serverId}-{projectId}-{sessionId}`.
 * The serverId and sessionId are known from `remoteInfo`, so we strip the
 * known prefix/suffix. Falls back to a heuristic split for malformed ids.
 *
 * Inline copy of the same logic at websocket-routes.ts:151-155 — kept in
 * sync there so behavior is consistent between status and taskCompleted.
 */
export function projectIdFromRemoteSessionId(
  sessionId: string,
  remoteInfo: RemoteSessionInfo,
): string {
  const prefix = `remote-${remoteInfo.remoteServerId}-`;
  const suffix = `-${remoteInfo.remoteSessionId}`;
  if (sessionId.startsWith(prefix) && sessionId.endsWith(suffix)) {
    return sessionId.slice(prefix.length, sessionId.length - suffix.length);
  }
  return sessionId.split("-").slice(2, -1).join("-");
}

/**
 * If `parsed` is a JsonPatch message from a remote agent session that
 * contains a `/status` op with a valid status string, return the
 * `session:status` event payload to emit on the local EventBus.
 *
 * Returns `null` if the message does not carry a status update.
 */
export function statusEventFromRemotePatch(
  parsed: Record<string, unknown>,
  sessionId: string,
  remoteInfo: RemoteSessionInfo,
): Extract<GlobalEvent, { type: "session:status" }> | null {
  if (!("JsonPatch" in parsed)) return null;
  const ops = parsed.JsonPatch as Array<{
    op: string;
    path: string;
    value?: { type?: string; content?: unknown };
  }>;
  const statusOp = ops.find((o) => o.path === "/status");
  if (!statusOp) return null;
  const content = statusOp.value?.content;
  if (content !== "running" && content !== "stopped" && content !== "error") {
    return null;
  }
  return {
    type: "session:status",
    projectId: projectIdFromRemoteSessionId(sessionId, remoteInfo),
    branch: remoteInfo.branch ?? null,
    sessionId,
    status: content as AgentSessionStatus,
  };
}
```

- [ ] **Step 2: Type-check the backend**

Run: `npx tsc --noEmit -p packages/vibedeckx/tsconfig.json`
Expected: no errors. (The new file is not yet imported anywhere — that's fine, tsc still type-checks it.)

- [ ] **Step 3: Commit**

```bash
git add packages/vibedeckx/src/routes/remote-status-bridge.ts
git commit -m "refactor(server): extract remote status patch parser

Pure helper that returns a session:status EventBus payload for a
remote-session JsonPatch carrying a /status op. No behavior change
yet — wired up in the next commit."
```

---

## Task 3: Wire the helper into `handleLiveMessage`

**Files:**
- Modify: `packages/vibedeckx/src/routes/websocket-routes.ts:138-140` (add the emit alongside the existing `cache.broadcast` for JsonPatch)

**Why:** Closes the path-2 gap — remote sessions previously only fed `taskCompleted` to the local EventBus. With this, every running/stopped/error transition on a remote session is delivered to all SSE clients.

- [ ] **Step 1: Add the import**

Near the other imports at the top of `packages/vibedeckx/src/routes/websocket-routes.ts` (around line 10), add:

```typescript
import { statusEventFromRemotePatch } from "./remote-status-bridge.js";
```

- [ ] **Step 2: Emit on EventBus when a status patch arrives**

Locate the JsonPatch branch inside `handleLiveMessage`:

```typescript
    if ("JsonPatch" in parsed) {
      cache.appendMessage(sessionId, raw, true);
      cache.broadcast(sessionId, raw);
    } else if ("finished" in parsed) {
```

Replace with:

```typescript
    if ("JsonPatch" in parsed) {
      cache.appendMessage(sessionId, raw, true);
      cache.broadcast(sessionId, raw);
      if (eventBus) {
        const statusEvent = statusEventFromRemotePatch(parsed, sessionId, remoteInfo);
        if (statusEvent) {
          console.log(`[AgentWS:remote→eventBus] ${sessionId} session:status=${statusEvent.status}`);
          eventBus.emit(statusEvent);
        }
      }
    } else if ("finished" in parsed) {
```

- [ ] **Step 3: Type-check the backend**

Run: `npx tsc --noEmit -p packages/vibedeckx/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/vibedeckx/src/routes/websocket-routes.ts
git commit -m "feat(server): bridge remote session status to local EventBus

Previously only taskCompleted was forwarded from remote agent sessions
to the local EventBus, so /api/events SSE never delivered running/
stopped/error transitions for remote projects — the sidebar relied
entirely on the 5s poll to notice. This emits session:status alongside
the patch broadcast, mirroring the existing taskCompleted bridge."
```

---

## Task 4: Manual end-to-end verification

**Files:** None (verification only).

**Why:** Backend has no test framework; this is the only way to confirm the bridge actually fires for a remote session. Frontend interval change is trivial enough that type-check + existing tests cover it.

- [ ] **Step 1: Start the dev stack**

Run in one terminal:

```bash
pnpm dev:all
```

Expected: backend starts on `:5173`, frontend on `:3000`.

- [ ] **Step 2: Verify the polling interval (no remote needed)**

Open `http://localhost:3000` in a browser and the DevTools Network tab. Filter by `agent-sessions`.
Expected: at most one `/api/projects/:id/agent-sessions` request every ~30 seconds (was every 5s before this change). The exact moment of the first request after page load may still be near-immediate due to the initial `fetchStatuses()` call — that's expected.

- [ ] **Step 3: Verify the remote status bridge (requires a remote project)**

If you do not have a remote vibedeckx server configured, skip this step and rely on the helper's pure unit shape — Task 5 covers a non-remote check.

If you do:
1. Open a project that points at a remote vibedeckx server.
2. In the project, trigger a session start (e.g. send a message to the agent in a non-selected branch from the sidebar context menu, or open another tab and send a message there).
3. In the backend dev terminal, watch for log lines of the form:
   ```
   [AgentWS:remote→eventBus] remote-<serverId>-<projectId>-<sessionId> session:status=running
   ```
4. In the browser DevTools Network tab, open the `/api/events` EventStream and confirm a `session:status` event with the matching `projectId`/`branch`/`status`.
5. Stop the agent. Confirm a second log line with `status=stopped` and a corresponding SSE event.

Expected: both transitions appear in logs and SSE.

- [ ] **Step 4: Verify the local path is unchanged**

Start an agent session in a local project. Confirm the sidebar dot still updates (this exercises the existing local emit path in `agent-session-manager.ts` — should be unaffected).

Expected: status indicator transitions exactly as before.

- [ ] **Step 5: No commit (verification step only)**

If anything failed in steps 2-4, fix the implementation and amend the relevant commit before moving on.

---

## Self-Review

Re-read against the spec ("方案 B + 路径 2 桥接"):

- [x] Method B (slow polling): Task 1 raises interval to 30s.
- [x] Path 2 bridge (remote `session:status` to local EventBus): Tasks 2 + 3.
- [x] Type-checks for both packages run after each change.
- [x] Existing frontend tests run (`vitest run`); none target the polling, so they should pass unchanged.
- [x] Helper is pure and named symmetrically with the existing `taskCompleted` bridge.
- [x] Commit messages explain the why (drift-correction role of the poll, gap that the bridge fills).
- [x] No backend test infrastructure was added — manual verification covers the only behavior change.

---

## Out of scope (explicitly deferred)

- **SSE initial-state snapshot** ("方案 C"): would let us drop polling entirely. Not done because (a) we still want a drift-correction net, (b) the change touches the SSE protocol shape and the EventSource auto-reconnect behavior, which is more risk than this incremental win warrants.
- **Cross-project global subscription**: backend already publishes all events; the frontend filter `data.projectId !== projectId` could be relaxed when we have a multi-project sidebar. Not needed for the current single-project page.
- **Backend test framework**: postponed until we have more than one helper to test.
