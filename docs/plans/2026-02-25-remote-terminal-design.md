# Remote Terminal Support

## Problem

Projects with both local and remote configurations can only create local terminals. Terminals should support remote creation, mirroring how executors already handle local/remote execution.

## Design

### Location Selection

- Default location follows the project's `executor_mode` setting (local or remote)
- The "+" button in the terminal panel becomes a split button: click creates at the default location, dropdown arrow offers the other location
- Each terminal tab shows an indicator (globe/laptop icon) when both locations are available
- Remote terminal names include "(remote)" suffix

### Backend

**New endpoint** — `POST /api/path/terminals` (in `terminal-routes.ts`):
- Accepts `{ path: string }`, spawns a terminal at that path via `processManager.startTerminal()`
- Returns `{ id, name, cwd }`
- Used by remote servers receiving proxied requests

**Modified `POST /api/projects/:projectId/terminals`**:
- New optional body param: `location?: 'local' | 'remote'`
- Decision logic mirrors executors: use remote when `location === 'remote'`, or when no `location` and project's `executor_mode === 'remote'` with remote credentials present
- Remote path: proxy via `proxyToRemote(POST /api/path/terminals)`, store mapping in `remoteExecutorMap` with ID format `remote-terminal-{remoteId}`, return prefixed ID to frontend
- Local path: unchanged behavior

**Modified `GET /api/projects/:projectId/terminals`**:
- When project has remote config and remote terminals may exist, also fetch from remote and merge results with `remote-terminal-` prefixed IDs
- Local terminals returned as-is

**Modified `DELETE /api/terminals/:terminalId`**:
- If ID starts with `remote-terminal-`, look up in `remoteExecutorMap` and proxy stop to remote server
- Otherwise: unchanged behavior

**WebSocket**: No changes needed. Existing `remote-` prefix handling in `websocket-routes.ts` already proxies PTY data bidirectionally via `remoteExecutorMap`.

### Frontend

**`RightPanel`**: Pass full `project` object to `TerminalPanel`.

**`TerminalPanel`**:
- Accept `project` prop
- Detect dual-location projects (both `path` and `remote_url` present)
- Split "+" button with dropdown for location override
- Tab indicators for terminal location

**`useTerminals`**: `createTerminal()` accepts optional `location: 'local' | 'remote'` parameter.

**`api.ts`**: `createTerminal()` sends `location` in request body.

### Data Flow

```
User clicks "+" → createTerminal(location)
  → POST /api/projects/:id/terminals { location }
  → terminal-routes decides local vs remote
  → Remote: proxyToRemote(POST /api/path/terminals { path })
           → remote spawns PTY, returns { id, name, cwd }
           → local stores in remoteExecutorMap
           → returns { id: 'remote-terminal-xxx', ... }
  → WebSocket: /api/executor-processes/remote-terminal-xxx/logs
             → websocket-routes proxies via remoteExecutorMap
             → bidirectional PTY streaming
```

## Not Implementing

- Separate `terminal_mode` setting — follows `executor_mode` instead
- Remote terminal persistence — terminals remain ephemeral (no DB storage)
