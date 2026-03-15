# Multi-Remote Connection Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend Vibedeckx from single-remote to multi-remote per project, with a global remote server registry and dynamic ExecutionModeToggle.

**Architecture:** New `remote_servers` and `project_remotes` tables replace per-project remote columns. The `ExecutionModeToggle` UI expands from a 2-button toggle to a dynamic button group. Session ID format gains a `remoteServerId` segment. Auto-migration converts existing data on startup.

**Tech Stack:** SQLite (better-sqlite3), Fastify, Next.js 16, React 19, Tailwind CSS v4, shadcn/ui

**Verification:** No test framework configured. Use type-checking as primary verification:
- Backend: `npx tsc --noEmit -p packages/vibedeckx/tsconfig.json`
- Frontend: `cd apps/vibedeckx-ui && npx tsc --noEmit`

---

## Phase 1: Backend Data Model

### Task 1.1: Add RemoteServer type and Storage interface

**Files:**
- Modify: `packages/vibedeckx/src/storage/types.ts`

**Step 1: Add RemoteServer interface and storage methods**

In `packages/vibedeckx/src/storage/types.ts`, add after the `SyncButtonConfig` interface (after line 9):

```typescript
export interface RemoteServer {
  id: string;
  name: string;
  url: string;
  api_key?: string;
  created_at: string;
  updated_at: string;
}
```

Add to the `Storage` interface (after the `projects` block, around line 115):

```typescript
remoteServers: {
  create(server: { name: string; url: string; api_key?: string }): RemoteServer;
  getAll(): RemoteServer[];
  getById(id: string): RemoteServer | undefined;
  getByUrl(url: string): RemoteServer | undefined;
  update(id: string, opts: { name?: string; url?: string; api_key?: string }): RemoteServer | undefined;
  delete(id: string): boolean;
};
```

**Step 2: Add ProjectRemote interface and storage methods**

In `packages/vibedeckx/src/storage/types.ts`, add after `RemoteServer`:

```typescript
export interface ProjectRemote {
  id: string;
  project_id: string;
  remote_server_id: string;
  remote_path: string;
  sort_order: number;
  sync_up_config?: SyncButtonConfig;
  sync_down_config?: SyncButtonConfig;
}

export interface ProjectRemoteWithServer extends ProjectRemote {
  server_name: string;
  server_url: string;
  server_api_key?: string;
}
```

Add to the `Storage` interface:

```typescript
projectRemotes: {
  getByProject(projectId: string): ProjectRemoteWithServer[];
  getByProjectAndServer(projectId: string, remoteServerId: string): ProjectRemoteWithServer | undefined;
  add(opts: {
    project_id: string;
    remote_server_id: string;
    remote_path: string;
    sort_order?: number;
    sync_up_config?: SyncButtonConfig;
    sync_down_config?: SyncButtonConfig;
  }): ProjectRemote;
  update(id: string, opts: {
    remote_path?: string;
    sort_order?: number;
    sync_up_config?: SyncButtonConfig | null;
    sync_down_config?: SyncButtonConfig | null;
  }): ProjectRemote | undefined;
  remove(id: string): boolean;
};
```

**Step 3: Update ExecutionMode type**

Change line 1 from:
```typescript
export type ExecutionMode = 'local' | 'remote';
```
to:
```typescript
export type ExecutionMode = 'local' | string;
```

Note: `'local'` is the only reserved value; any other string is treated as a `remote_server_id`.

**Step 4: Run type check**

Run: `npx tsc --noEmit -p packages/vibedeckx/tsconfig.json`
Expected: Errors in `sqlite.ts` (missing implementation) — that's expected, we implement next.

**Step 5: Commit**

```bash
git add packages/vibedeckx/src/storage/types.ts
git commit -m "feat: add RemoteServer and ProjectRemote types to storage interface"
```

---

### Task 1.2: Implement remote_servers table and CRUD in SQLite

**Files:**
- Modify: `packages/vibedeckx/src/storage/sqlite.ts`

**Step 1: Add remote_servers table creation**

In `sqlite.ts`, add table creation SQL after the existing table definitions (around line 84, in the `initializeDatabase` or equivalent block):

```sql
CREATE TABLE IF NOT EXISTS remote_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  api_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

**Step 2: Add remote_servers CRUD methods**

Add methods to the returned storage object, implementing the `remoteServers` interface from types.ts. Use `crypto.randomUUID()` for IDs. Pattern follows existing project CRUD methods.

```typescript
remoteServers: {
  create(server: { name: string; url: string; api_key?: string }): RemoteServer {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO remote_servers (id, name, url, api_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, server.name, server.url, server.api_key ?? null, now, now);
    return { id, name: server.name, url: server.url, api_key: server.api_key, created_at: now, updated_at: now };
  },
  getAll(): RemoteServer[] {
    return db.prepare(`SELECT * FROM remote_servers ORDER BY name`).all() as RemoteServer[];
  },
  getById(id: string): RemoteServer | undefined {
    return db.prepare(`SELECT * FROM remote_servers WHERE id = ?`).get(id) as RemoteServer | undefined;
  },
  getByUrl(url: string): RemoteServer | undefined {
    return db.prepare(`SELECT * FROM remote_servers WHERE url = ?`).get(url) as RemoteServer | undefined;
  },
  update(id: string, opts: { name?: string; url?: string; api_key?: string }): RemoteServer | undefined {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (opts.name !== undefined) { fields.push('name = ?'); values.push(opts.name); }
    if (opts.url !== undefined) { fields.push('url = ?'); values.push(opts.url); }
    if (opts.api_key !== undefined) { fields.push('api_key = ?'); values.push(opts.api_key); }
    if (fields.length === 0) return this.getById(id);
    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);
    db.prepare(`UPDATE remote_servers SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getById(id);
  },
  delete(id: string): boolean {
    const result = db.prepare(`DELETE FROM remote_servers WHERE id = ?`).run(id);
    return result.changes > 0;
  },
},
```

**Step 3: Run type check**

Run: `npx tsc --noEmit -p packages/vibedeckx/tsconfig.json`
Expected: Errors for missing `projectRemotes` — expected, next task.

**Step 4: Commit**

```bash
git add packages/vibedeckx/src/storage/sqlite.ts
git commit -m "feat: implement remote_servers table and CRUD in SQLite"
```

---

### Task 1.3: Implement project_remotes table and CRUD in SQLite

**Files:**
- Modify: `packages/vibedeckx/src/storage/sqlite.ts`

**Step 1: Add project_remotes table creation**

```sql
CREATE TABLE IF NOT EXISTS project_remotes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  remote_server_id TEXT NOT NULL REFERENCES remote_servers(id),
  remote_path TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  sync_up_config TEXT,
  sync_down_config TEXT,
  UNIQUE(project_id, remote_server_id)
);
```

**Step 2: Add project_remotes CRUD methods**

```typescript
projectRemotes: {
  getByProject(projectId: string): ProjectRemoteWithServer[] {
    return db.prepare(`
      SELECT pr.*, rs.name as server_name, rs.url as server_url, rs.api_key as server_api_key
      FROM project_remotes pr
      JOIN remote_servers rs ON pr.remote_server_id = rs.id
      WHERE pr.project_id = ?
      ORDER BY pr.sort_order
    `).all(projectId).map(row => ({
      ...row,
      sync_up_config: row.sync_up_config ? JSON.parse(row.sync_up_config) : undefined,
      sync_down_config: row.sync_down_config ? JSON.parse(row.sync_down_config) : undefined,
    })) as ProjectRemoteWithServer[];
  },
  getByProjectAndServer(projectId: string, remoteServerId: string): ProjectRemoteWithServer | undefined {
    const row = db.prepare(`
      SELECT pr.*, rs.name as server_name, rs.url as server_url, rs.api_key as server_api_key
      FROM project_remotes pr
      JOIN remote_servers rs ON pr.remote_server_id = rs.id
      WHERE pr.project_id = ? AND pr.remote_server_id = ?
    `).get(projectId, remoteServerId);
    if (!row) return undefined;
    return {
      ...row,
      sync_up_config: row.sync_up_config ? JSON.parse(row.sync_up_config) : undefined,
      sync_down_config: row.sync_down_config ? JSON.parse(row.sync_down_config) : undefined,
    } as ProjectRemoteWithServer;
  },
  add(opts): ProjectRemote {
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO project_remotes (id, project_id, remote_server_id, remote_path, sort_order, sync_up_config, sync_down_config)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, opts.project_id, opts.remote_server_id, opts.remote_path,
      opts.sort_order ?? 0,
      opts.sync_up_config ? JSON.stringify(opts.sync_up_config) : null,
      opts.sync_down_config ? JSON.stringify(opts.sync_down_config) : null,
    );
    return { id, ...opts, sort_order: opts.sort_order ?? 0 };
  },
  update(id, opts): ProjectRemote | undefined {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (opts.remote_path !== undefined) { fields.push('remote_path = ?'); values.push(opts.remote_path); }
    if (opts.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(opts.sort_order); }
    if (opts.sync_up_config !== undefined) {
      fields.push('sync_up_config = ?');
      values.push(opts.sync_up_config ? JSON.stringify(opts.sync_up_config) : null);
    }
    if (opts.sync_down_config !== undefined) {
      fields.push('sync_down_config = ?');
      values.push(opts.sync_down_config ? JSON.stringify(opts.sync_down_config) : null);
    }
    if (fields.length === 0) return undefined;
    values.push(id);
    db.prepare(`UPDATE project_remotes SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return db.prepare(`SELECT * FROM project_remotes WHERE id = ?`).get(id) as ProjectRemote | undefined;
  },
  remove(id: string): boolean {
    const result = db.prepare(`DELETE FROM project_remotes WHERE id = ?`).run(id);
    return result.changes > 0;
  },
},
```

**Step 3: Run type check**

Run: `npx tsc --noEmit -p packages/vibedeckx/tsconfig.json`
Expected: PASS (all Storage interface methods implemented)

**Step 4: Commit**

```bash
git add packages/vibedeckx/src/storage/sqlite.ts
git commit -m "feat: implement project_remotes table and CRUD in SQLite"
```

---

### Task 1.4: Add data migration for existing remote projects

**Files:**
- Modify: `packages/vibedeckx/src/storage/sqlite.ts`

**Step 1: Add migration logic**

In the migrations section (after line 139), add a new migration that runs after `remote_servers` and `project_remotes` tables exist:

```typescript
// Migration: Move existing project remote configs to remote_servers + project_remotes
const existingRemotes = db.prepare(
  `SELECT DISTINCT remote_url, remote_api_key FROM projects WHERE remote_url IS NOT NULL AND remote_url != ''`
).all();

for (const row of existingRemotes) {
  const existing = db.prepare(`SELECT id FROM remote_servers WHERE url = ?`).get(row.remote_url);
  if (!existing) {
    const url = new URL(row.remote_url);
    const name = url.hostname;
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO remote_servers (id, name, url, api_key, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).run(id, name, row.remote_url, row.remote_api_key);
  }
}

const projectsWithRemote = db.prepare(
  `SELECT id, remote_url, remote_path, sync_up_config, sync_down_config, agent_mode, executor_mode FROM projects WHERE remote_url IS NOT NULL AND remote_url != ''`
).all();

for (const proj of projectsWithRemote) {
  const server = db.prepare(`SELECT id FROM remote_servers WHERE url = ?`).get(proj.remote_url);
  if (!server) continue;
  const existing = db.prepare(
    `SELECT id FROM project_remotes WHERE project_id = ? AND remote_server_id = ?`
  ).get(proj.id, server.id);
  if (!existing) {
    db.prepare(
      `INSERT INTO project_remotes (id, project_id, remote_server_id, remote_path, sort_order, sync_up_config, sync_down_config) VALUES (?, ?, ?, ?, 0, ?, ?)`
    ).run(crypto.randomUUID(), proj.id, server.id, proj.remote_path, proj.sync_up_config, proj.sync_down_config);
  }
  // Update agent_mode/executor_mode from 'remote' to the server ID
  if (proj.agent_mode === 'remote') {
    db.prepare(`UPDATE projects SET agent_mode = ? WHERE id = ?`).run(server.id, proj.id);
  }
  if (proj.executor_mode === 'remote') {
    db.prepare(`UPDATE projects SET executor_mode = ? WHERE id = ?`).run(server.id, proj.id);
  }
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit -p packages/vibedeckx/tsconfig.json`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/vibedeckx/src/storage/sqlite.ts
git commit -m "feat: add auto-migration for existing remote projects to new tables"
```

---

## Phase 2: Backend API Routes

### Task 2.1: Add remote servers CRUD routes

**Files:**
- Create: `packages/vibedeckx/src/routes/remote-server-routes.ts`
- Modify: `packages/vibedeckx/src/server.ts` (register new routes)

**Step 1: Create the route file**

Create `packages/vibedeckx/src/routes/remote-server-routes.ts`:

```typescript
import type { FastifyInstance } from "fastify";

function sanitizeServer(server: { api_key?: string; [key: string]: unknown }) {
  const { api_key: _, ...safe } = server;
  return safe;
}

export async function remoteServerRoutes(fastify: FastifyInstance) {
  // GET /api/remote-servers
  fastify.get("/api/remote-servers", async (_request, reply) => {
    const servers = fastify.storage.remoteServers.getAll();
    return reply.send(servers.map(sanitizeServer));
  });

  // POST /api/remote-servers
  fastify.post("/api/remote-servers", async (request, reply) => {
    const { name, url, apiKey } = request.body as { name: string; url: string; apiKey?: string };
    if (!name || !url) return reply.code(400).send({ error: "name and url are required" });
    const existing = fastify.storage.remoteServers.getByUrl(url);
    if (existing) return reply.code(409).send({ error: "A server with this URL already exists" });
    const server = fastify.storage.remoteServers.create({ name, url, api_key: apiKey });
    return reply.code(201).send(sanitizeServer(server));
  });

  // PUT /api/remote-servers/:id
  fastify.put("/api/remote-servers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name, url, apiKey } = request.body as { name?: string; url?: string; apiKey?: string };
    const server = fastify.storage.remoteServers.update(id, { name, url, api_key: apiKey });
    if (!server) return reply.code(404).send({ error: "Server not found" });
    return reply.send(sanitizeServer(server));
  });

  // DELETE /api/remote-servers/:id
  fastify.delete("/api/remote-servers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = fastify.storage.remoteServers.delete(id);
    if (!deleted) return reply.code(404).send({ error: "Server not found" });
    return reply.send({ success: true });
  });

  // POST /api/remote-servers/:id/test
  fastify.post("/api/remote-servers/:id/test", async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = fastify.storage.remoteServers.getById(id);
    if (!server) return reply.code(404).send({ error: "Server not found" });
    try {
      const { proxyToRemote } = await import("../utils/remote-proxy.js");
      const result = await proxyToRemote(server.url, server.api_key ?? "", "GET", "/api/health");
      if (result.ok) return reply.send({ success: true });
      return reply.code(502).send({ error: "Connection failed", details: result.data });
    } catch (err) {
      return reply.code(502).send({ error: "Connection failed" });
    }
  });
}
```

**Step 2: Register routes in server.ts**

In `packages/vibedeckx/src/server.ts`, import and register:

```typescript
import { remoteServerRoutes } from "./routes/remote-server-routes.js";
// ...
await fastify.register(remoteServerRoutes);
```

**Step 3: Run type check**

Run: `npx tsc --noEmit -p packages/vibedeckx/tsconfig.json`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/vibedeckx/src/routes/remote-server-routes.ts packages/vibedeckx/src/server.ts
git commit -m "feat: add remote servers CRUD API routes"
```

---

### Task 2.2: Add project remotes CRUD routes

**Files:**
- Create: `packages/vibedeckx/src/routes/project-remote-routes.ts`
- Modify: `packages/vibedeckx/src/server.ts` (register)

**Step 1: Create the route file**

Create `packages/vibedeckx/src/routes/project-remote-routes.ts`:

```typescript
import type { FastifyInstance } from "fastify";

function sanitizeProjectRemote(pr: { server_api_key?: string; [key: string]: unknown }) {
  const { server_api_key: _, ...safe } = pr;
  return safe;
}

export async function projectRemoteRoutes(fastify: FastifyInstance) {
  // GET /api/projects/:id/remotes
  fastify.get("/api/projects/:id/remotes", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = fastify.storage.projects.getById(id);
    if (!project) return reply.code(404).send({ error: "Project not found" });
    const remotes = fastify.storage.projectRemotes.getByProject(id);
    return reply.send(remotes.map(sanitizeProjectRemote));
  });

  // POST /api/projects/:id/remotes
  fastify.post("/api/projects/:id/remotes", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { remoteServerId, remotePath, sortOrder, syncUpConfig, syncDownConfig } = request.body as {
      remoteServerId: string;
      remotePath: string;
      sortOrder?: number;
      syncUpConfig?: { actionType: string; executionMode: string; content: string };
      syncDownConfig?: { actionType: string; executionMode: string; content: string };
    };
    if (!remoteServerId || !remotePath) {
      return reply.code(400).send({ error: "remoteServerId and remotePath are required" });
    }
    const project = fastify.storage.projects.getById(id);
    if (!project) return reply.code(404).send({ error: "Project not found" });
    const server = fastify.storage.remoteServers.getById(remoteServerId);
    if (!server) return reply.code(404).send({ error: "Remote server not found" });
    const existing = fastify.storage.projectRemotes.getByProjectAndServer(id, remoteServerId);
    if (existing) return reply.code(409).send({ error: "This remote is already linked to this project" });
    const pr = fastify.storage.projectRemotes.add({
      project_id: id,
      remote_server_id: remoteServerId,
      remote_path: remotePath,
      sort_order: sortOrder,
      sync_up_config: syncUpConfig as any,
      sync_down_config: syncDownConfig as any,
    });
    return reply.code(201).send(pr);
  });

  // PUT /api/projects/:id/remotes/:rid
  fastify.put("/api/projects/:id/remotes/:rid", async (request, reply) => {
    const { rid } = request.params as { id: string; rid: string };
    const { remotePath, sortOrder, syncUpConfig, syncDownConfig } = request.body as {
      remotePath?: string;
      sortOrder?: number;
      syncUpConfig?: { actionType: string; executionMode: string; content: string } | null;
      syncDownConfig?: { actionType: string; executionMode: string; content: string } | null;
    };
    const updated = fastify.storage.projectRemotes.update(rid, {
      remote_path: remotePath,
      sort_order: sortOrder,
      sync_up_config: syncUpConfig as any,
      sync_down_config: syncDownConfig as any,
    });
    if (!updated) return reply.code(404).send({ error: "Project remote not found" });
    return reply.send(updated);
  });

  // DELETE /api/projects/:id/remotes/:rid
  fastify.delete("/api/projects/:id/remotes/:rid", async (request, reply) => {
    const { rid } = request.params as { id: string; rid: string };
    const removed = fastify.storage.projectRemotes.remove(rid);
    if (!removed) return reply.code(404).send({ error: "Project remote not found" });
    return reply.send({ success: true });
  });
}
```

**Step 2: Register in server.ts**

```typescript
import { projectRemoteRoutes } from "./routes/project-remote-routes.js";
// ...
await fastify.register(projectRemoteRoutes);
```

**Step 3: Run type check**

Run: `npx tsc --noEmit -p packages/vibedeckx/tsconfig.json`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/vibedeckx/src/routes/project-remote-routes.ts packages/vibedeckx/src/server.ts
git commit -m "feat: add project remotes CRUD API routes"
```

---

### Task 2.3: Update RemoteSessionInfo and session ID format

**Files:**
- Modify: `packages/vibedeckx/src/server-types.ts` (lines 17-22)
- Modify: `packages/vibedeckx/src/routes/agent-session-routes.ts` (lines 115-218)

**Step 1: Add remoteServerId to RemoteSessionInfo**

In `server-types.ts`, update `RemoteSessionInfo` (lines 17-22):

```typescript
export interface RemoteSessionInfo {
  remoteServerId: string;  // NEW
  remoteUrl: string;
  remoteApiKey: string;
  remoteSessionId: string;
  branch?: string | null;
}
```

Also update `RemoteExecutorInfo` (lines 9-15):

```typescript
export interface RemoteExecutorInfo {
  remoteServerId: string;  // NEW
  remoteUrl: string;
  remoteApiKey: string;
  remoteProcessId: string;
  projectId?: string;
  branch?: string | null;
}
```

**Step 2: Update agent session creation for multi-remote**

In `agent-session-routes.ts`, update the POST handler for `/api/projects/:projectId/agent-sessions` (around lines 126-155).

The key change: instead of reading `project.remote_url` and `project.remote_api_key`, look up the target remote via `project.agent_mode` (which now holds a `remote_server_id` instead of `'remote'`).

Current logic (around line 126):
```typescript
const useRemoteAgent = project.remote_url && project.agent_mode === 'remote';
```

New logic:
```typescript
const agentMode = project.agent_mode;
const useRemoteAgent = agentMode !== 'local';

if (useRemoteAgent) {
  // Look up the remote via project_remotes + remote_servers
  const projectRemote = fastify.storage.projectRemotes.getByProjectAndServer(project.id, agentMode);
  if (!projectRemote) return reply.code(404).send({ error: "Remote not configured for this project" });
  const remoteUrl = projectRemote.server_url;
  const remoteApiKey = projectRemote.server_api_key ?? "";
  const remotePath = projectRemote.remote_path;
  // ... rest of proxy logic using these values
```

Update the session ID format (around line 149):
```typescript
// Old: const localSessionId = `remote-${project.id}-${remoteData.session.id}`;
const localSessionId = `remote-${agentMode}-${project.id}-${remoteData.session.id}`;
```

Update the `remoteSessionMap` entry to include `remoteServerId`:
```typescript
fastify.remoteSessionMap.set(localSessionId, {
  remoteServerId: agentMode,  // NEW
  remoteUrl,
  remoteApiKey,
  remoteSessionId: remoteData.session.id,
  branch: branch ?? null,
});
```

**Step 3: Update all session ID parsing**

All methods that check `sessionId.startsWith("remote-")` (lines 224, 273, 320, 346, 393, 438, 490, 526) remain unchanged — they look up `remoteSessionMap` by the full `localSessionId`, which still starts with `remote-`.

**Step 4: Run type check**

Run: `npx tsc --noEmit -p packages/vibedeckx/tsconfig.json`
Expected: May have errors in `websocket-routes.ts` or other files using `RemoteExecutorInfo`/`RemoteSessionInfo` — fix by adding the `remoteServerId` field where these objects are constructed.

**Step 5: Fix all remaining type errors**

Search for all places that construct `RemoteSessionInfo` or `RemoteExecutorInfo` objects and add the `remoteServerId` field. Key locations:
- `routes/agent-session-routes.ts` — session creation
- `routes/executor-routes.ts` or wherever executor processes are created remotely

**Step 6: Run type check again**

Run: `npx tsc --noEmit -p packages/vibedeckx/tsconfig.json`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/vibedeckx/src/server-types.ts packages/vibedeckx/src/routes/agent-session-routes.ts
git commit -m "feat: update session ID format and remote lookup for multi-remote"
```

---

### Task 2.4: Update execute-sync route for multi-remote

**Files:**
- Modify: `packages/vibedeckx/src/routes/project-routes.ts` (lines 198-252)

**Step 1: Update sync execution**

The `POST /api/projects/:id/execute-sync` route currently reads sync config from `project.sync_up_config` / `project.sync_down_config`. Update to:

1. Accept an optional `remoteServerId` in the request body
2. If provided, look up the sync config from `project_remotes` instead of the project
3. If not provided, fall back to the first remote's config (backward compat)

Update the route body type:
```typescript
const { syncType, branch, remoteServerId } = request.body as {
  syncType: 'up' | 'down';
  branch?: string;
  remoteServerId?: string;
};
```

Look up sync config:
```typescript
let syncConfig: SyncButtonConfig | undefined;
let remoteUrl: string | undefined;
let remoteApiKey: string | undefined;
let remotePath: string | undefined;

if (remoteServerId) {
  const pr = fastify.storage.projectRemotes.getByProjectAndServer(project.id, remoteServerId);
  if (!pr) return reply.code(404).send({ error: "Remote not linked to project" });
  syncConfig = syncType === 'up' ? pr.sync_up_config : pr.sync_down_config;
  remoteUrl = pr.server_url;
  remoteApiKey = pr.server_api_key;
  remotePath = pr.remote_path;
} else {
  // Fallback to legacy project fields
  syncConfig = syncType === 'up' ? project.sync_up_config : project.sync_down_config;
  remoteUrl = project.remote_url;
  remoteApiKey = project.remote_api_key;
  remotePath = project.remote_path;
}
```

**Step 2: Run type check**

Run: `npx tsc --noEmit -p packages/vibedeckx/tsconfig.json`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/vibedeckx/src/routes/project-routes.ts
git commit -m "feat: update sync execution to support multi-remote lookup"
```

---

## Phase 3: Frontend Types and API Layer

### Task 3.1: Update frontend types and add API methods

**Files:**
- Modify: `apps/vibedeckx-ui/lib/api.ts`

**Step 1: Add RemoteServer and ProjectRemote interfaces**

After the `Project` interface (around line 68), add:

```typescript
export interface RemoteServer {
  id: string;
  name: string;
  url: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectRemote {
  id: string;
  project_id: string;
  remote_server_id: string;
  remote_path: string;
  sort_order: number;
  sync_up_config?: SyncButtonConfig;
  sync_down_config?: SyncButtonConfig;
  server_name: string;
  server_url: string;
}
```

**Step 2: Update ExecutionMode type**

Change line 39 from:
```typescript
export type ExecutionMode = 'local' | 'remote';
```
to:
```typescript
export type ExecutionMode = 'local' | string;
```

**Step 3: Add remote server API methods**

Add to the `api` object:

```typescript
// Remote Servers
async getRemoteServers(): Promise<RemoteServer[]> {
  const res = await fetch(`${getApiBase()}/api/remote-servers`, { headers: getHeaders() });
  return res.json();
},

async createRemoteServer(opts: { name: string; url: string; apiKey?: string }): Promise<RemoteServer> {
  const res = await fetch(`${getApiBase()}/api/remote-servers`, {
    method: "POST",
    headers: { ...getHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  return res.json();
},

async updateRemoteServer(id: string, opts: { name?: string; url?: string; apiKey?: string }): Promise<RemoteServer> {
  const res = await fetch(`${getApiBase()}/api/remote-servers/${id}`, {
    method: "PUT",
    headers: { ...getHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  return res.json();
},

async deleteRemoteServer(id: string): Promise<void> {
  await fetch(`${getApiBase()}/api/remote-servers/${id}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
},

async testRemoteServer(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${getApiBase()}/api/remote-servers/${id}/test`, {
    method: "POST",
    headers: getHeaders(),
  });
  return res.json();
},
```

**Step 4: Add project remotes API methods**

```typescript
// Project Remotes
async getProjectRemotes(projectId: string): Promise<ProjectRemote[]> {
  const res = await fetch(`${getApiBase()}/api/projects/${projectId}/remotes`, { headers: getHeaders() });
  return res.json();
},

async addProjectRemote(projectId: string, opts: {
  remoteServerId: string;
  remotePath: string;
  sortOrder?: number;
}): Promise<ProjectRemote> {
  const res = await fetch(`${getApiBase()}/api/projects/${projectId}/remotes`, {
    method: "POST",
    headers: { ...getHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  return res.json();
},

async updateProjectRemote(projectId: string, remoteId: string, opts: {
  remotePath?: string;
  sortOrder?: number;
  syncUpConfig?: SyncButtonConfig | null;
  syncDownConfig?: SyncButtonConfig | null;
}): Promise<ProjectRemote> {
  const res = await fetch(`${getApiBase()}/api/projects/${projectId}/remotes/${remoteId}`, {
    method: "PUT",
    headers: { ...getHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  return res.json();
},

async removeProjectRemote(projectId: string, remoteId: string): Promise<void> {
  await fetch(`${getApiBase()}/api/projects/${projectId}/remotes/${remoteId}`, {
    method: "DELETE",
    headers: getHeaders(),
  });
},
```

**Step 5: Run type check**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`
Expected: PASS (or errors in components still using `'remote'` literal — expected, fixed in Phase 5)

**Step 6: Commit**

```bash
git add apps/vibedeckx-ui/lib/api.ts
git commit -m "feat: add remote server and project remote types and API methods"
```

---

## Phase 4: Global Remote Servers Management UI

### Task 4.1: Create Remote Servers settings component

**Files:**
- Create: `apps/vibedeckx-ui/components/settings/remote-servers-settings.tsx`

**Step 1: Build the component**

This is a full CRUD list component:
- Fetches servers via `api.getRemoteServers()` on mount
- Displays a table with Name, URL, and action buttons (Edit, Delete, Test)
- "Add Server" button opens an inline form or dialog
- Edit inline or in dialog (name, url, api_key)
- Delete with confirmation
- Test connection with status indicator

Use existing shadcn/ui components: `Button`, `Input`, `Dialog`, `Table`, etc.

The component should be self-contained and export as default.

**Step 2: Integrate into settings**

Find the settings page or sidebar and add a link/section for "Remote Servers". The exact integration point depends on the current settings UI structure — check `apps/vibedeckx-ui/app/` or `components/settings/` for the existing settings layout.

If no settings page exists, add a settings icon button in the app header that opens a dialog containing the remote servers management UI.

**Step 3: Run type check**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/vibedeckx-ui/components/settings/
git commit -m "feat: add remote servers management UI"
```

---

## Phase 5: ExecutionModeToggle Extension

### Task 5.1: Extend ExecutionModeToggle to support N targets

**Files:**
- Modify: `apps/vibedeckx-ui/components/ui/execution-mode-toggle.tsx` (lines 6-49)

**Step 1: Update props interface**

Replace the current props (lines 6-10):

```typescript
// Old
interface ExecutionModeToggleProps {
  mode: "local" | "remote";
  onModeChange: (mode: "local" | "remote") => void;
  disabled?: boolean;
}

// New
interface ExecutionModeTarget {
  id: string;         // 'local' or remote_server_id
  label: string;      // 'Local' or server name
  icon?: React.ComponentType<{ className?: string }>;  // Monitor, Cloud, etc.
}

interface ExecutionModeToggleProps {
  targets: ExecutionModeTarget[];
  activeTarget: string;                    // 'local' or remote_server_id
  onTargetChange: (targetId: string) => void;
  onAddRemote?: () => void;               // "+" button callback
  disabled?: boolean;
}
```

**Step 2: Update component rendering**

Replace the two hardcoded buttons with a dynamic loop over `targets`. Keep the same visual style (pill buttons with active/inactive states). Add overflow handling: if `targets.length > 5`, show first 4 + a `...` dropdown with the rest.

Add a "+" button at the end if `onAddRemote` is provided.

**Step 3: Run type check**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`
Expected: FAIL — all consumers need updating (next tasks).

**Step 4: Commit (WIP)**

```bash
git add apps/vibedeckx-ui/components/ui/execution-mode-toggle.tsx
git commit -m "feat: extend ExecutionModeToggle to support N targets"
```

---

### Task 5.2: Create useProjectRemotes hook

**Files:**
- Create: `apps/vibedeckx-ui/hooks/use-project-remotes.ts`

**Step 1: Create hook**

This hook fetches project remotes and builds the targets list for `ExecutionModeToggle`:

```typescript
import { useState, useEffect, useCallback } from "react";
import { api, type ProjectRemote } from "@/lib/api";
import { Monitor, Cloud } from "lucide-react";

export function useProjectRemotes(projectId: string | undefined) {
  const [remotes, setRemotes] = useState<ProjectRemote[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await api.getProjectRemotes(projectId);
      setRemotes(data);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { refresh(); }, [refresh]);

  const targets = [
    // Only include Local if project has a local path — caller decides
  ];

  return { remotes, loading, refresh, targets };
}
```

**Step 2: Run type check**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/vibedeckx-ui/hooks/use-project-remotes.ts
git commit -m "feat: add useProjectRemotes hook"
```

---

### Task 5.3: Update AgentConversation to use new toggle

**Files:**
- Modify: `apps/vibedeckx-ui/components/agent/agent-conversation.tsx` (lines 242-247)

**Step 1: Update props**

Change `onAgentModeChange` prop type from `(mode: ExecutionMode) => void` to `(targetId: string) => void` (already compatible since `ExecutionMode = 'local' | string`).

**Step 2: Replace toggle usage**

Replace lines 242-247 with the new `ExecutionModeToggle` that receives `targets` from `useProjectRemotes` and maps `project.agent_mode` to `activeTarget`.

Build targets array:
```typescript
const targets = [];
if (project?.path) targets.push({ id: 'local', label: 'Local', icon: Monitor });
for (const remote of projectRemotes) {
  targets.push({ id: remote.remote_server_id, label: remote.server_name, icon: Cloud });
}
```

Only show toggle when `targets.length > 1`.

**Step 3: Run type check**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add apps/vibedeckx-ui/components/agent/agent-conversation.tsx
git commit -m "feat: update AgentConversation to use multi-target toggle"
```

---

### Task 5.4: Update ExecutorPanel to use new toggle

**Files:**
- Modify: `apps/vibedeckx-ui/components/executor/executor-panel.tsx` (lines 160-165)

**Step 1: Same pattern as Task 5.3**

Replace the `ExecutionModeToggle` usage with the new multi-target version. Build targets from `useProjectRemotes`. Map `project.executor_mode` to `activeTarget`.

**Step 2: Run type check**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/vibedeckx-ui/components/executor/executor-panel.tsx
git commit -m "feat: update ExecutorPanel to use multi-target toggle"
```

---

### Task 5.5: Update DiffPanel to use new toggle

**Files:**
- Modify: `apps/vibedeckx-ui/components/diff/diff-panel.tsx` (lines 90-96)

**Step 1: Same pattern**

Replace toggle with multi-target version. The `diffTarget` local state changes from `'local' | 'remote'` to `string` (either `'local'` or a `remote_server_id`). The `useDiff` and `useCommits` hooks need to accept this new target format and resolve it to the appropriate API call.

**Step 2: Run type check**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/vibedeckx-ui/components/diff/diff-panel.tsx
git commit -m "feat: update DiffPanel to use multi-target toggle"
```

---

### Task 5.6: Update TerminalPanel location dropdown

**Files:**
- Modify: `apps/vibedeckx-ui/components/terminal/terminal-panel.tsx` (lines 145-193)

**Step 1: Expand dropdown menu**

Replace the hardcoded "Local Terminal" / "Remote Terminal" dropdown items with a dynamic list built from `useProjectRemotes`. Each item shows the server name. The `createTerminal` function passes the `remote_server_id` as the location (or `'local'`).

**Step 2: Run type check**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/vibedeckx-ui/components/terminal/terminal-panel.tsx
git commit -m "feat: update TerminalPanel for multi-remote location selection"
```

---

### Task 5.7: Update page.tsx mode change handlers

**Files:**
- Modify: `apps/vibedeckx-ui/app/page.tsx` (lines 202-218)

**Step 1: Update handler types**

The handlers already accept `ExecutionMode` which is now `'local' | string`, so the type is already compatible. Just verify the `updateProject` call passes the correct value to `agentMode` / `executorMode`.

**Step 2: Run full type check**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`
Expected: PASS — all components updated

**Step 3: Commit**

```bash
git add apps/vibedeckx-ui/app/page.tsx
git commit -m "feat: update page.tsx mode handlers for multi-remote"
```

---

## Phase 6: Project Dialog Updates

### Task 6.1: Update create-project-dialog for multi-remote

**Files:**
- Modify: `apps/vibedeckx-ui/components/project/create-project-dialog.tsx`

**Step 1: Replace inline remote fields with server picker**

Replace the remote URL + API key inputs (lines 182-251) with:

1. A "Remote Servers" section showing a list of remotes to add
2. Button: "Add Remote" → opens a picker dialog/popover:
   - Lists all servers from `api.getRemoteServers()`
   - "New Server" option at bottom with inline name/url/apiKey fields
3. For each selected server, show a `RemoteDirectoryBrowser` to pick the path
4. Display a list of added remotes (server name + path) with remove buttons

The `onProjectCreated` callback needs to return the list of remotes to add after project creation. Or better: create the project first, then call `api.addProjectRemote()` for each remote.

**Step 2: Run type check**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add apps/vibedeckx-ui/components/project/create-project-dialog.tsx
git commit -m "feat: update create-project-dialog for multi-remote server selection"
```

---

### Task 6.2: Update edit-project-dialog for multi-remote

**Files:**
- Modify: `apps/vibedeckx-ui/components/project/edit-project-dialog.tsx`

**Step 1: Replace single remote config with multi-remote management**

In the Settings tab, replace the single remote URL/API key section with a list of linked remotes. Each remote shows:
- Server name + URL (read-only, edit in global settings)
- Remote path (editable)
- Remove button

"Add Remote" button to link another server.

**Step 2: Update Sync tabs**

Change Sync Up / Sync Down tabs from a single config to per-remote configs. Show a sub-selector or accordion for each remote's sync config.

**Step 3: Run type check**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`

**Step 4: Commit**

```bash
git add apps/vibedeckx-ui/components/project/edit-project-dialog.tsx
git commit -m "feat: update edit-project-dialog for multi-remote management"
```

---

### Task 6.3: Update project-card for multi-remote

**Files:**
- Modify: `apps/vibedeckx-ui/components/project/project-card.tsx` (lines 92-102, 165-181)

**Step 1: Update remote badges**

Replace single "Remote" / "Local + Remote" badge (lines 92-102) with a badge that shows the count:
- No remotes: no badge (local only)
- 1 remote: "Remote: Dev Server" badge
- N remotes: "N Remotes" badge

**Step 2: Update remote path display**

Replace single remote path display (lines 165-181) with a list showing each linked remote's server name + path.

**Step 3: Update sync buttons**

If multiple remotes have sync configs, show sync buttons per remote (or a dropdown to choose which remote to sync).

**Step 4: Run type check**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`

**Step 5: Commit**

```bash
git add apps/vibedeckx-ui/components/project/project-card.tsx
git commit -m "feat: update project-card for multi-remote display"
```

---

## Phase 7: Final Verification

### Task 7.1: Full type check and build

**Step 1: Backend type check**

Run: `npx tsc --noEmit -p packages/vibedeckx/tsconfig.json`
Expected: PASS

**Step 2: Frontend type check**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`
Expected: PASS

**Step 3: Frontend lint**

Run: `pnpm --filter vibedeckx-ui lint`
Expected: PASS (or only pre-existing warnings)

**Step 4: Full build**

Run: `pnpm build`
Expected: PASS

**Step 5: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: resolve type errors and lint issues from multi-remote implementation"
```
