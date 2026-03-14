# Multi-Remote Connection Support Design

## Overview

Extend Vibedeckx from supporting a single remote server per project to supporting multiple remote servers, with a global remote registry for reuse across projects. The existing `ExecutionModeToggle` pattern (Local/Remote toggle in panel headers) extends naturally to N targets.

## Data Model

### New: `remote_servers` Table (Global Registry)

```
remote_servers
├── id          TEXT PRIMARY KEY
├── name        TEXT NOT NULL        -- User-defined, e.g. "Dev Server"
├── url         TEXT NOT NULL UNIQUE -- e.g. http://192.168.1.100:5173
├── api_key     TEXT                 -- Authentication key
├── created_at  TEXT
└── updated_at  TEXT
```

### New: `project_remotes` Association Table

```
project_remotes
├── id               TEXT PRIMARY KEY
├── project_id       TEXT NOT NULL  → projects.id
├── remote_server_id TEXT NOT NULL  → remote_servers.id
├── remote_path      TEXT NOT NULL  -- Project path on that remote
├── sort_order       INTEGER        -- Tab display order
├── sync_up_config   TEXT           -- JSON, per-remote sync config
├── sync_down_config TEXT           -- JSON, per-remote sync config
└── UNIQUE(project_id, remote_server_id)
```

### Changes to `projects` Table

- `remote_url`, `remote_api_key`, `remote_path`, `sync_up_config`, `sync_down_config` — deprecated, kept for migration
- `agent_mode` / `executor_mode` — change from `'local' | 'remote'` to `'local' | <remote_server_id>`
- `is_remote` — retained for compat, semantics become "has at least one remote"

### Session ID Format

Current: `remote-${projectId}-${remoteSessionId}`
New: `remote-${remoteServerId}-${projectId}-${remoteSessionId}`

## UI: ExecutionModeToggle Extension

### Current

Two-button toggle (Local / Remote) in Agent, Executor, and Diff panel headers. Only shown for hybrid projects.

### Multi-Remote

Dynamic button group sourced from `project_remotes`:

```
┌───────┬────────────┬─────────┬───┐
│ Local │ Dev Server │ Staging │ + │
└───────┴────────────┴─────────┴───┘
```

- First button: **Local** (if project has local path)
- Subsequent buttons: sorted by `sort_order`, showing `remote_servers.name`
- **"+"** button: opens picker to select from global registry or create new
- Overflow (>4 remotes): excess items collapse into `...` dropdown
- Hidden when only one target exists (no switching needed)

### Per-Panel Behavior

| Panel | Switching behavior |
|-------|-------------------|
| **Agent** | Each remote has its own independent agent session, can run in parallel |
| **Executor** | Shows executor group for the selected remote |
| **Diff** | Switches diff/commits data source to selected remote |
| **Terminal** | Create terminal dropdown expands from Local/Remote to Local + all remote names |

### State Persistence

- Agent/Executor target: persisted in `project.agent_mode` / `project.executor_mode`
- Diff target: component-local state (resets on project change)

## Global Remote Servers Management

### Entry Point

Settings page → "Remote Servers" section.

### Page Layout

List of all registered remote servers with actions: edit, delete, test connection. Delete warns if projects are using the server.

### In Project Dialog

When adding a remote to a project:
1. Picker shows all servers from global registry
2. "New Server" option to create inline (auto-saves to registry)
3. After selecting server → Remote Directory Browser to pick path
4. Confirms → writes to `project_remotes`

### API Endpoints

```
GET    /api/remote-servers            -- List all (api_key sanitized)
POST   /api/remote-servers            -- Create
PUT    /api/remote-servers/:id        -- Update
DELETE /api/remote-servers/:id        -- Delete
POST   /api/remote-servers/:id/test   -- Test connection

GET    /api/projects/:id/remotes      -- List project's remotes
POST   /api/projects/:id/remotes      -- Add remote to project
PUT    /api/projects/:id/remotes/:rid -- Update (remote_path, sort_order, sync config)
DELETE /api/projects/:id/remotes/:rid -- Remove remote from project
```

## Session & WebSocket Proxy

### Session Creation

```
POST /api/projects/:projectId/agent-sessions
Body: { target: "local" | remoteServerId }

Backend:
  target === "local" → local spawn
  otherwise → lookup remote_servers via project_remotes
            → proxyToRemote(url, apiKey, ...)
            → localSessionId = remote-${remoteServerId}-${projectId}-${remoteSessionId}
            → store in remoteSessionMap
```

### remoteSessionMap / remoteExecutorMap

Add `remoteServerId` field to `RemoteSessionInfo` and `RemoteExecutorInfo`.

### RemotePatchCache

No structural changes needed — cache key is `localSessionId` which now includes `remoteServerId`, providing natural isolation.

### Parallel Session Constraint

One active session per remote server per branch (natural extension of current single-remote constraint).

## Migration Strategy

### Database Migration (auto on startup)

1. Create `remote_servers` and `project_remotes` tables
2. For each project with `remote_url`:
   - Create `remote_servers` entry per unique `remote_url` (name defaults to hostname)
   - Create `project_remotes` association, migrating `remote_path`, `sync_up_config`, `sync_down_config`
3. Replace `agent_mode` / `executor_mode` values of `'remote'` with corresponding `remote_server_id`
4. Old columns retained but unused (no destructive ALTER)

### Session ID Compatibility

- New sessions use new format
- Old format `remote-${projectId}-${remoteSessionId}` falls back via degraded matching in `remoteSessionMap`
- Historical session records in DB left as-is

### Frontend Compatibility

- `ExecutionMode` type: `'local' | 'remote'` → `'local' | string` (string = remote server ID)
- `isHybrid` check: `hasLocal && hasRemote` → number of available targets > 1
