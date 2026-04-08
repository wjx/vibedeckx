# Remote Executor Reconnection on Server Restart

**Date**: 2026-04-08
**Status**: Approved

## Problem

When the local server restarts, the in-memory `remoteExecutorMap` is lost. Remote executor processes that are still running on the remote server appear as stopped in the UI (showing a Start button). The user has no way to reconnect to those processes or see their output.

## Solution: Persist remoteExecutorMap to DB

Persist `RemoteExecutorInfo` entries to a new SQLite table. On startup, load persisted entries, verify each against the remote server, and repopulate the in-memory map for processes that are still running.

## Design

### 1. New DB Table: `remote_executor_processes`

```sql
CREATE TABLE IF NOT EXISTS remote_executor_processes (
  local_process_id TEXT PRIMARY KEY,
  remote_server_id TEXT NOT NULL,
  remote_url TEXT NOT NULL,
  remote_api_key TEXT NOT NULL,
  remote_process_id TEXT NOT NULL,
  executor_id TEXT NOT NULL,
  project_id TEXT,
  branch TEXT,
  started_at TEXT DEFAULT CURRENT_TIMESTAMP
)
```

Mirrors `RemoteExecutorInfo` with `local_process_id` as key (the `remote-{executorId}-{remoteProcessId}` string).

### 2. Storage Interface

Add to `Storage` in `types.ts`:

```typescript
remoteExecutorProcesses: {
  insert(localProcessId: string, info: RemoteExecutorInfo): void;
  delete(localProcessId: string): void;
  getAll(): Array<{ local_process_id: string } & RemoteExecutorInfo>;
}
```

### 3. Lifecycle: Insert/Delete

- **On remote executor start** (`process-routes.ts`, after `remoteExecutorMap.set()`): insert into DB.
- **On remote executor stop** (`process-routes.ts`, after `remoteExecutorMap.delete()`): delete from DB.
- **On WebSocket "finished"** (if cleanup occurs when remote process finishes naturally): delete from DB.

### 4. Restore on Startup (`shared-services.ts`)

After creating `remoteExecutorMap`, before the server starts serving requests:

1. Load all rows from `remote_executor_processes`.
2. Group by `remote_server_id`.
3. For each remote server, call `GET /api/executor-processes/running` via `proxyToRemoteAuto`.
4. For each DB row, check if `remote_process_id` appears in the remote's running process list.
   - **Still running**: repopulate `remoteExecutorMap`, emit `executor:started` event.
   - **No longer running**: delete from DB (stale entry).

### 5. Edge Cases

- **Remote server unreachable on startup**: Log a warning, keep the DB row (remote may come back later). Do not repopulate the map entry — the executor will appear stopped. A future server restart or manual refresh can retry.
- **Local executor processes**: Unaffected. The existing `sqlite.ts:274` blanket kill (`UPDATE executor_processes SET status = 'killed' WHERE status = 'running'`) continues to handle local processes. The new table is separate.

## Files Changed

| File | Change |
|------|--------|
| `packages/vibedeckx/src/storage/types.ts` | Add `remoteExecutorProcesses` to Storage interface |
| `packages/vibedeckx/src/storage/sqlite.ts` | Create table, implement CRUD methods |
| `packages/vibedeckx/src/routes/process-routes.ts` | Insert/delete DB rows on remote start/stop |
| `packages/vibedeckx/src/plugins/shared-services.ts` | Restore logic on startup |

## Out of Scope

- Local executor reconnection (PTY processes die on server exit; detached processes lose their output streams)
- Periodic retry for unreachable remote servers (single attempt on startup is sufficient for now)
- Remote session (`remoteSessionMap`) reconnection (separate concern)
