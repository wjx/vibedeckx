# Remote Server User Isolation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user_id isolation to remote_servers so each user only sees their own servers.

**Architecture:** Mirror the existing projects userId pattern. Add user_id column + index to remote_servers, add userId parameter to Storage interface methods, add requireAuth to all route handlers.

**Tech Stack:** SQLite (better-sqlite3), Fastify, TypeScript

**Note:** No test framework is configured in this project. Verification is done via type-checking (`npx tsc --noEmit`).

---

## Chunk 1: Database Migration & Storage Layer

### Task 1: Add user_id column, index, and UNIQUE(url, user_id) to remote_servers

**Files:**
- Modify: `packages/vibedeckx/src/storage/sqlite.ts` — insert after line 314 (end of reverse-connect migration), before `return db;`

**Note:** `PRAGMA foreign_keys` is OFF by default in this codebase (only WAL mode is set). The table recreation below relies on this — the `project_remotes` FK reference to `remote_servers(id)` is preserved because PKs don't change.

- [ ] **Step 1: Add single atomic migration for user_id + UNIQUE constraint change**

After the existing reverse-connect migration block (line 314), insert:

```typescript
// Migration: add user_id column and change UNIQUE(url) to UNIQUE(url, user_id) for multi-user isolation
if (!remoteServerTableInfo.some(col => col.name === "user_id")) {
  db.exec(`
    BEGIN;
    ALTER TABLE remote_servers ADD COLUMN user_id TEXT NOT NULL DEFAULT '';
    CREATE TABLE remote_servers_new (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      api_key TEXT,
      connection_mode TEXT NOT NULL DEFAULT 'outbound',
      connect_token TEXT,
      connect_token_created_at TEXT,
      status TEXT NOT NULL DEFAULT 'unknown',
      last_connected_at TEXT,
      user_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(url, user_id)
    );
    INSERT INTO remote_servers_new SELECT
      id, name, url, api_key, connection_mode, connect_token, connect_token_created_at,
      status, last_connected_at, user_id, created_at, updated_at
    FROM remote_servers;
    DROP TABLE remote_servers;
    ALTER TABLE remote_servers_new RENAME TO remote_servers;
    CREATE INDEX IF NOT EXISTS idx_remote_servers_user_id ON remote_servers(user_id);
    COMMIT;
  `);
}
```

- [ ] **Step 3: Add user_id to RemoteServerRow type**

In `sqlite.ts` at line 355, add `user_id: string` to the `RemoteServerRow` type:

```typescript
type RemoteServerRow = {
  id: string;
  name: string;
  url: string;
  api_key: string | null;
  connection_mode: string;
  connect_token: string | null;
  connect_token_created_at: string | null;
  status: string;
  last_connected_at: string | null;
  user_id: string;  // ADD THIS
  created_at: string;
  updated_at: string;
};
```

- [ ] **Step 4: Commit**

```bash
git add packages/vibedeckx/src/storage/sqlite.ts
git commit -m "feat: add user_id column and migration to remote_servers"
```

### Task 2: Update Storage interface in types.ts

**Files:**
- Modify: `packages/vibedeckx/src/storage/types.ts:149-160`

- [ ] **Step 1: Add userId parameter to remoteServers methods**

Replace lines 149-160 with:

```typescript
remoteServers: {
  create(server: { name: string; url: string; api_key?: string; connection_mode?: RemoteServerConnectionMode }, userId?: string): RemoteServer;
  getAll(userId?: string): RemoteServer[];
  getById(id: string, userId?: string): RemoteServer | undefined;
  getByUrl(url: string): RemoteServer | undefined;
  getByToken(token: string): RemoteServer | undefined;
  update(id: string, opts: { name?: string; url?: string; api_key?: string; connection_mode?: RemoteServerConnectionMode }, userId?: string): RemoteServer | undefined;
  updateStatus(id: string, status: RemoteServerStatus): void;
  generateToken(id: string, userId?: string): string | undefined;
  revokeToken(id: string, userId?: string): boolean;
  delete(id: string, userId?: string): boolean;
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/vibedeckx/src/storage/types.ts
git commit -m "feat: add userId param to remoteServers Storage interface"
```

### Task 3: Update SQLite remoteServers implementation

**Files:**
- Modify: `packages/vibedeckx/src/storage/sqlite.ts:513-613`

- [ ] **Step 1: Update create() to accept and store userId**

Replace the `create` method (lines 514-524):

```typescript
create: (server: { name: string; url: string; api_key?: string; connection_mode?: RemoteServerConnectionMode }, userId?: string): RemoteServer => {
  const id = crypto.randomUUID();
  const connectionMode = server.connection_mode ?? 'outbound';
  db.prepare(
    `INSERT INTO remote_servers (id, name, url, api_key, connection_mode, user_id) VALUES (@id, @name, @url, @api_key, @connection_mode, @user_id)`
  ).run({ id, name: server.name, url: server.url, api_key: server.api_key ?? null, connection_mode: connectionMode, user_id: userId ?? '' });

  return toRemoteServer(db
    .prepare<{ id: string }, RemoteServerRow>(`SELECT * FROM remote_servers WHERE id = @id`)
    .get({ id })!);
},
```

- [ ] **Step 2: Update getAll() to filter by userId**

Replace the `getAll` method (lines 526-531):

```typescript
getAll: (userId?: string): RemoteServer[] => {
  if (userId) {
    return db
      .prepare<{ user_id: string }, RemoteServerRow>(`SELECT * FROM remote_servers WHERE user_id = @user_id ORDER BY created_at DESC`)
      .all({ user_id: userId })
      .map(toRemoteServer);
  }
  return db
    .prepare<{}, RemoteServerRow>(`SELECT * FROM remote_servers ORDER BY created_at DESC`)
    .all({})
    .map(toRemoteServer);
},
```

- [ ] **Step 3: Update getById() to filter by userId**

Replace the `getById` method (lines 533-538):

```typescript
getById: (id: string, userId?: string): RemoteServer | undefined => {
  if (userId) {
    const row = db
      .prepare<{ id: string; user_id: string }, RemoteServerRow>(`SELECT * FROM remote_servers WHERE id = @id AND user_id = @user_id`)
      .get({ id, user_id: userId });
    return row ? toRemoteServer(row) : undefined;
  }
  const row = db
    .prepare<{ id: string }, RemoteServerRow>(`SELECT * FROM remote_servers WHERE id = @id`)
    .get({ id });
  return row ? toRemoteServer(row) : undefined;
},
```

- [ ] **Step 4: Update update() to filter by userId**

Replace the `update` method (lines 554-584). Add `userId?: string` param, add ownerFilter pattern (same as projects.update):

```typescript
update: (id: string, opts: { name?: string; url?: string; api_key?: string; connection_mode?: RemoteServerConnectionMode }, userId?: string): RemoteServer | undefined => {
  const updates: string[] = [];
  const params: Record<string, unknown> = { id };

  if (opts.name !== undefined) {
    updates.push('name = @name');
    params.name = opts.name;
  }
  if (opts.url !== undefined) {
    updates.push('url = @url');
    params.url = opts.url;
  }
  if (opts.api_key !== undefined) {
    updates.push('api_key = @api_key');
    params.api_key = opts.api_key;
  }
  if (opts.connection_mode !== undefined) {
    updates.push('connection_mode = @connection_mode');
    params.connection_mode = opts.connection_mode;
  }

  const ownerFilter = userId ? ' AND user_id = @user_id' : '';
  if (userId) params.user_id = userId;

  if (updates.length === 0) {
    const row = db.prepare<Record<string, unknown>, RemoteServerRow>(`SELECT * FROM remote_servers WHERE id = @id${ownerFilter}`).get(params);
    return row ? toRemoteServer(row) : undefined;
  }

  updates.push("updated_at = datetime('now')");
  db.prepare(`UPDATE remote_servers SET ${updates.join(', ')} WHERE id = @id${ownerFilter}`).run(params);
  const row = db.prepare<Record<string, unknown>, RemoteServerRow>(`SELECT * FROM remote_servers WHERE id = @id${ownerFilter}`).get(params);
  return row ? toRemoteServer(row) : undefined;
},
```

- [ ] **Step 5: Update generateToken() to filter by userId**

Replace the `generateToken` method (lines 593-601):

```typescript
generateToken: (id: string, userId?: string): string | undefined => {
  const ownerFilter = userId ? ' AND user_id = @user_id' : '';
  const params: Record<string, unknown> = { id };
  if (userId) params.user_id = userId;

  const existing = db.prepare<Record<string, unknown>, RemoteServerRow>(`SELECT * FROM remote_servers WHERE id = @id${ownerFilter}`).get(params);
  if (!existing) return undefined;
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare(
    `UPDATE remote_servers SET connect_token = @token, connect_token_created_at = datetime('now'), updated_at = datetime('now') WHERE id = @id${ownerFilter}`
  ).run({ ...params, token });
  return token;
},
```

- [ ] **Step 6: Update revokeToken() to filter by userId**

Replace the `revokeToken` method (lines 603-608):

```typescript
revokeToken: (id: string, userId?: string): boolean => {
  const ownerFilter = userId ? ' AND user_id = @user_id' : '';
  const params: Record<string, unknown> = { id };
  if (userId) params.user_id = userId;

  const result = db.prepare(
    `UPDATE remote_servers SET connect_token = NULL, connect_token_created_at = NULL, updated_at = datetime('now') WHERE id = @id${ownerFilter}`
  ).run(params);
  return result.changes > 0;
},
```

- [ ] **Step 7: Update delete() to filter by userId**

Replace the `delete` method (lines 610-613):

```typescript
delete: (id: string, userId?: string): boolean => {
  if (userId) {
    const result = db.prepare(`DELETE FROM remote_servers WHERE id = @id AND user_id = @user_id`).run({ id, user_id: userId });
    return result.changes > 0;
  }
  const result = db.prepare(`DELETE FROM remote_servers WHERE id = @id`).run({ id });
  return result.changes > 0;
},
```

- [ ] **Step 8: Run type check**

Run: `npx tsc --noEmit -p packages/vibedeckx/tsconfig.json`
Expected: PASS (or only pre-existing errors unrelated to our changes)

- [ ] **Step 9: Commit**

```bash
git add packages/vibedeckx/src/storage/sqlite.ts
git commit -m "feat: implement userId filtering in remoteServers SQLite methods"
```

## Chunk 2: Route Layer

### Task 4: Add requireAuth to all remote-server routes

**Files:**
- Modify: `packages/vibedeckx/src/routes/remote-server-routes.ts:1-191`

- [ ] **Step 1: Add requireAuth import**

Add import at the top of the file (after existing imports):

```typescript
import { requireAuth } from "../server.js";
```

- [ ] **Step 2: Update GET /api/remote-servers**

Replace lines 14-17:

```typescript
fastify.get("/api/remote-servers", async (request, reply) => {
  const userId = requireAuth(request, reply);
  if (userId === null) return;
  const servers = fastify.storage.remoteServers.getAll(userId);
  return reply.send(servers.map(sanitizeServer));
});
```

- [ ] **Step 3: Update POST /api/remote-servers**

Add auth check at start of handler. Remove the `getByUrl` pre-check — the DB `UNIQUE(url, user_id)` constraint now handles duplicate detection per-user. Catch the constraint violation and return 409. Pass userId to create:

```typescript
fastify.post("/api/remote-servers", async (request, reply) => {
  const userId = requireAuth(request, reply);
  if (userId === null) return;
  const { name, url, apiKey, connectionMode } = request.body as {
    name: string;
    url: string;
    apiKey?: string;
    connectionMode?: "outbound" | "inbound";
  };
  if (!name)
    return reply.code(400).send({ error: "name is required" });
  if (connectionMode !== "inbound" && !url)
    return reply.code(400).send({ error: "url is required for outbound servers" });
  try {
    const server = fastify.storage.remoteServers.create({
      name,
      url: url || "",
      api_key: apiKey,
      connection_mode: connectionMode,
    }, userId);
    return reply.code(201).send(sanitizeServer(server));
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("UNIQUE constraint failed")) {
      return reply.code(409).send({ error: "A server with this URL already exists" });
    }
    throw err;
  }
});
```

- [ ] **Step 4: Update PUT /api/remote-servers/:id**

Add auth check, pass userId to update:

```typescript
fastify.put<{ Params: { id: string } }>(
  "/api/remote-servers/:id",
  async (request, reply) => {
    const userId = requireAuth(request, reply);
    if (userId === null) return;
    const { id } = request.params;
    const { name, url, apiKey } = request.body as {
      name?: string;
      url?: string;
      apiKey?: string;
    };
    const server = fastify.storage.remoteServers.update(id, {
      name,
      url,
      api_key: apiKey,
    }, userId);
    if (!server)
      return reply.code(404).send({ error: "Server not found" });
    return reply.send(sanitizeServer(server));
  }
);
```

- [ ] **Step 5: Update DELETE /api/remote-servers/:id**

```typescript
fastify.delete<{ Params: { id: string } }>(
  "/api/remote-servers/:id",
  async (request, reply) => {
    const userId = requireAuth(request, reply);
    if (userId === null) return;
    const { id } = request.params;
    const deleted = fastify.storage.remoteServers.delete(id, userId);
    if (!deleted)
      return reply.code(404).send({ error: "Server not found" });
    return reply.send({ success: true });
  }
);
```

- [ ] **Step 6: Update POST /api/remote-servers/:id/test**

Replace lines 82-112:

```typescript
fastify.post<{ Params: { id: string } }>(
  "/api/remote-servers/:id/test",
  async (request, reply) => {
    const userId = requireAuth(request, reply);
    if (userId === null) return;
    const { id } = request.params;
    const server = fastify.storage.remoteServers.getById(id, userId);
    if (!server)
      return reply.code(404).send({ error: "Server not found" });

    // For inbound servers, check if reverse-connected
    if (server.connection_mode === "inbound") {
      const connected = fastify.reverseConnectManager.isConnected(id);
      return reply.send({ success: connected, status: connected ? "online" : "offline" });
    }

    try {
      const result = await proxyToRemote(
        server.url,
        server.api_key ?? "",
        "GET",
        "/api/projects"
      );
      if (result.ok)
        return reply.send({ success: true });
      return reply
        .code(502)
        .send({ error: "Connection failed", details: result.data });
    } catch (err) {
      return reply.code(502).send({ error: "Connection failed" });
    }
  }
);
```

- [ ] **Step 7: Update POST /api/remote-servers/:id/generate-token**

Replace lines 115-136:

```typescript
fastify.post<{ Params: { id: string } }>(
  "/api/remote-servers/:id/generate-token",
  async (request, reply) => {
    const userId = requireAuth(request, reply);
    if (userId === null) return;
    const { id } = request.params;
    const server = fastify.storage.remoteServers.getById(id, userId);
    if (!server)
      return reply.code(404).send({ error: "Server not found" });
    if (server.connection_mode !== "inbound")
      return reply.code(400).send({ error: "Token generation is only available for inbound servers" });

    const token = fastify.storage.remoteServers.generateToken(id, userId);
    if (!token)
      return reply.code(500).send({ error: "Failed to generate token" });

    // Derive server URL from the incoming request
    const proto = request.headers["x-forwarded-proto"] || request.protocol || "http";
    const host = request.headers["x-forwarded-host"] || request.headers.host || "localhost";
    const serverUrl = `${proto}://${host}`;
    const connectCommand = `vibedeckx connect --connect-to ${serverUrl} --token ${token}`;
    return reply.send({ token, connectCommand });
  }
);
```

- [ ] **Step 8: Update POST /api/remote-servers/:id/browse**

Replace lines 139-167:

```typescript
fastify.post<{ Params: { id: string } }>(
  "/api/remote-servers/:id/browse",
  async (request, reply) => {
    const userId = requireAuth(request, reply);
    if (userId === null) return;
    const { id } = request.params;
    const { path: browsePath } = (request.body as { path?: string }) ?? {};
    const server = fastify.storage.remoteServers.getById(id, userId);
    if (!server)
      return reply.code(404).send({ error: "Server not found" });

    try {
      const queryPath = browsePath ? `?path=${encodeURIComponent(browsePath)}` : "";
      const result = await proxyToRemoteAuto(
        id,
        server.url,
        server.api_key ?? "",
        "GET",
        `/api/browse${queryPath}`,
        undefined,
        { reverseConnectManager: fastify.reverseConnectManager }
      );
      if (result.ok) {
        return reply.send(result.data);
      }
      return reply.code(502).send({ error: "Failed to browse remote directory", details: result.data });
    } catch (err) {
      return reply.code(502).send({ error: "Failed to browse remote directory" });
    }
  }
);
```

- [ ] **Step 9: Update POST /api/remote-servers/:id/revoke-token**

```typescript
fastify.post<{ Params: { id: string } }>(
  "/api/remote-servers/:id/revoke-token",
  async (request, reply) => {
    const userId = requireAuth(request, reply);
    if (userId === null) return;
    const { id } = request.params;
    const server = fastify.storage.remoteServers.getById(id, userId);
    if (!server)
      return reply.code(404).send({ error: "Server not found" });

    if (fastify.reverseConnectManager.isConnected(id)) {
      fastify.reverseConnectManager.unregisterConnection(id);
      fastify.storage.remoteServers.updateStatus(id, "offline");
    }

    const revoked = fastify.storage.remoteServers.revokeToken(id, userId);
    return reply.send({ success: revoked });
  }
);
```

- [ ] **Step 10: Run type check**

Run: `npx tsc --noEmit -p packages/vibedeckx/tsconfig.json`
Expected: PASS

- [ ] **Step 11: Run frontend type check**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`
Expected: PASS (frontend doesn't depend on backend types directly)

- [ ] **Step 12: Commit**

```bash
git add packages/vibedeckx/src/routes/remote-server-routes.ts
git commit -m "feat: add requireAuth to all remote-server routes for user isolation"
```
