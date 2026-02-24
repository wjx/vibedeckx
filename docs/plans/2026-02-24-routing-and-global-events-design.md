# Routing Refactor & Global Event Stream

**Date:** 2026-02-24

## Summary

Refactor frontend routing to use path variables for projects and add a global SSE event stream for real-time cross-project status notifications. Tab and branch remain as query parameters.

## URL Structure

```
/                              → redirect to /projects/:firstProjectId
/projects/[projectId]          → main app shell
  ?tab=workspace|tasks|files   → active view (default: tasks)
  &branch=feat-x               → selected branch
```

- Project switching = `router.push(/projects/${id})` (full page transition, agent WebSocket reconnects)
- Tab/branch switching = `window.history.replaceState` (no unmount, hidden CSS trick preserved)
- Static export compatible: `[projectId]` resolves client-side

## Global Event Stream

Single SSE endpoint at `GET /api/events` pushing all observable state changes across all projects.

### Event Types

```typescript
type GlobalEvent =
  | { type: "session:status";   projectId: string; branch: string; sessionId: string; status: "running" | "stopped" | "error" }
  | { type: "session:finished"; projectId: string; branch: string; sessionId: string; duration_ms?: number; cost_usd?: number }
  | { type: "task:created";     projectId: string; task: Task }
  | { type: "task:updated";     projectId: string; task: Task }
  | { type: "task:deleted";     projectId: string; taskId: string }
  | { type: "executor:started"; projectId: string; executorId: string; processId: string }
  | { type: "executor:stopped"; projectId: string; executorId: string; processId: string }
```

### Backend

- **`EventBus`** class: typed in-process EventEmitter, registered as Fastify decoration
- **`AgentSessionManager`**: emits `session:status` and `session:finished` on status changes
- **`ProcessManager`**: emits `executor:started` and `executor:stopped`
- **Task routes**: emit `task:created`, `task:updated`, `task:deleted` on mutations
- **SSE route** (`GET /api/events`): subscribes to EventBus, writes `text/event-stream`

### Why SSE over WebSocket

- Unidirectional (server → client only)
- Native browser reconnection via `EventSource`
- Simpler lifecycle than managing another WebSocket

## Frontend Changes

### New Files

| File | Purpose |
|------|---------|
| `app/projects/[projectId]/page.tsx` | Main app shell (moved from `app/page.tsx`) |
| `hooks/use-global-events.ts` | SSE client hook with subscriber pattern |

### Backend New Files

| File | Purpose |
|------|---------|
| `packages/vibedeckx/src/event-bus.ts` | Typed in-process EventEmitter |
| `packages/vibedeckx/src/routes/event-routes.ts` | SSE endpoint `GET /api/events` |

### What Changes

| Current | After |
|---------|-------|
| Single `app/page.tsx` with all logic | `app/page.tsx` redirects, `app/projects/[projectId]/page.tsx` holds the app |
| `useProjects` manages `currentProject` via state | `currentProject` derived from URL `projectId` param |
| `selectProject` sets state | `selectProject` calls `router.push` |
| `useSessionStatuses` polls every 5s | Removed — replaced by global event stream |
| `useTasks` fetch-only, manual `refetch()` calls | Subscribes to `task:*` events for real-time updates |
| `useExecutors` fetch-only | Subscribes to `executor:*` events for real-time updates |
| `realtimeWorkspaceStatuses` state in page.tsx | Derived from global event stream |
| URL sync via `window.history.replaceState` | `projectId` via Next.js routing, tab/branch still via `replaceState` |

### What Stays the Same

- `hidden` CSS trick for tab switching (no unmount)
- Per-session WebSocket for agent conversation messages (patches, history replay)
- Agent WebSocket reconnects on project switch
- `useAgentSession` hook internals untouched
- All backend REST API endpoints unchanged
- Remote session proxy architecture
