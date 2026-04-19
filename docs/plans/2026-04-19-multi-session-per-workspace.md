# Multi-Session per Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a workspace (projectId + branch) to hold multiple agent conversations. Users click "New Conversation" to start a fresh session with a new `sessionId`, and pick from a dropdown of prior sessions to resume.

**Architecture:** Drop the `UNIQUE(project_id, branch)` constraint on `agent_sessions`. Treat `sessionId` as the URL-addressable identity (`?session=<id>` query param). Add a `title` column + `updated_at` column. "New Conversation" stops the current session (if running) and creates a brand-new row. A dropdown next to the existing button lists all sessions for the current branch, ordered by `updated_at DESC`, with rename and delete actions. Single-active UI (one subscribed at a time), but backend allows multiple dormant/stopped/running rows in parallel (no auto-kill on switch — that is an accepted tradeoff).

**Tech Stack:** Fastify + SQLite (`better-sqlite3`) on backend; Next.js 16 + React 19 + Tailwind v4 + shadcn/ui on frontend. No test framework — verification via type-check commands + manual smoke tests in a browser.

**Key decisions locked in during brainstorming:**
- Concurrency model A (single active UI + many dormant), "don't kill on switch" accepted.
- New Conversation = `stopSession(old)` + create new (confirmation dialog only when old status is `running`).
- Labels: `title || firstUserMessageSnippet || timestamp` (no LLM auto-titles in v1).
- URL: `?session=<sessionId>` query param on `/`; omitted ⇒ backend returns most-recent for branch.
- Delete: per-entry delete in hover menu, with auto-redirect to next-most-recent (or empty state).
- Ordering: `updated_at DESC`.

---

## File Structure

**Backend (`packages/vibedeckx/src/`):**
- `storage/sqlite.ts` — DDL migration (drop UNIQUE, add `title`, add `updated_at`), replace `DELETE … WHERE project_id/branch` in `create()`, add `listByBranch`, `getLatestByBranch`, `updateTitle`, `touchUpdatedAt`.
- `storage/types.ts` — extend `AgentSession` and `Storage.agentSessions` interface.
- `agent-session-manager.ts` — add `createNewSession(projectId, branch, projectPath, permissionMode, agentType)` which always returns a new id; update `persistEntry`/`pushEntry` paths to bump `updated_at`; add `setTitle()`. Keep `restartSession()` but repurpose for the path-routed endpoint change; in the new flow it is no longer called from the UI.
- `routes/agent-session-routes.ts` — add `POST /api/projects/:projectId/agent-sessions/new` (explicit new), `PATCH /api/agent-sessions/:sessionId/title`, extend `GET /api/projects/:projectId/agent-sessions` with optional `?branch=` filter. `DELETE /api/agent-sessions/:sessionId` already exists — verify it stops running before delete.
- `conversation-patch.ts` — (optional, phase 2) new `TITLE` patch variant so title updates stream over WS.

**Frontend (`apps/vibedeckx-ui/`):**
- `lib/api.ts` — add `listBranchSessions`, `createNewSession`, `renameSession`, `deleteSessionApi` helpers (the last already exists, adjust if needed).
- `hooks/use-agent-session.ts` — accept optional `sessionId` prop; replace `restartSession` with `startNewConversation` that POSTs to `/new` and updates URL; adjust `sessionCache` key from `(projectId, branch)` to `(projectId, branch, sessionId)`.
- `components/agent/session-history-dropdown.tsx` — NEW component (list, rename inline, delete with confirm).
- `components/agent/agent-conversation.tsx` — replace existing `restartSession` icon button behavior and add the dropdown left of it.
- `app/page.tsx` — read `?session=` from URL; pass as prop to `AgentConversation`; react to URL changes.

---

## Phase 1 — Tracer Bullet: Two sessions per branch, switch via URL

**Goal:** Prove the architecture works end-to-end. By end of phase 1, a user can click "New Conversation" to create a fresh session (new `sessionId`), the old one remains in the DB, and the URL is updated to include `?session=<id>`. Reloading the page or navigating with a stale `?session=` loads that specific session. No UI dropdown yet, no title column — just raw session IDs addressable via URL.

### Task 1.1: DB migration — drop UNIQUE constraint on agent_sessions + add updated_at

**Files:**
- Modify: `packages/vibedeckx/src/storage/sqlite.ts` (two spots: initial `CREATE TABLE` block around line 77-85 for fresh DBs, and migration block around line 261-289 for existing DBs)

- [ ] **Step 1: Update the initial schema DDL (for fresh DBs)**

Replace the `CREATE TABLE IF NOT EXISTS agent_sessions (...)` block at lines 77-85 with:

```sql
CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'running',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_project_branch
  ON agent_sessions(project_id, branch);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_updated_at
  ON agent_sessions(updated_at DESC);
```

Note: `UNIQUE(project_id, branch)` is removed. Add a non-unique index so `getLatestByBranch` is fast.

- [ ] **Step 2: Add migration for existing DBs to drop the UNIQUE index and add updated_at column**

After the existing "add agent_type column" migration (after line 289), insert:

```typescript
// Migration: drop UNIQUE(project_id, branch) on agent_sessions (multi-session support)
const sessionInfoV3 = db.prepare("PRAGMA table_info(agent_sessions)").all() as { name: string }[];
const hasUpdatedAtColumn = sessionInfoV3.some(col => col.name === "updated_at");
if (!hasUpdatedAtColumn) {
  db.exec(`
    BEGIN;
    CREATE TABLE agent_sessions_new (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      branch TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'running',
      permission_mode TEXT DEFAULT 'edit',
      agent_type TEXT DEFAULT 'claude-code',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    INSERT INTO agent_sessions_new (id, project_id, branch, status, permission_mode, agent_type, created_at, updated_at)
      SELECT id, project_id, branch, status, permission_mode, agent_type, created_at, created_at
      FROM agent_sessions;
    DROP TABLE agent_sessions;
    ALTER TABLE agent_sessions_new RENAME TO agent_sessions;
    CREATE INDEX IF NOT EXISTS idx_agent_sessions_project_branch
      ON agent_sessions(project_id, branch);
    CREATE INDEX IF NOT EXISTS idx_agent_sessions_updated_at
      ON agent_sessions(updated_at DESC);
    COMMIT;
  `);
}
```

Note: SQLite cannot drop a `UNIQUE` table constraint in place — we rebuild the table via the standard "copy-new-drop-rename" dance. `agent_session_entries` references `agent_sessions(id)` via FK ON DELETE CASCADE; because we preserve the same `id` values, existing entries survive. `PRAGMA foreign_keys` defaults to OFF in better-sqlite3 unless explicitly ON, so the rebuild is safe without disabling FKs. If FKs are ON in this codebase, wrap the block with `PRAGMA foreign_keys = OFF;` before BEGIN and `PRAGMA foreign_keys = ON;` after COMMIT.

- [ ] **Step 3: Backup existing DB before first run, then type-check**

```bash
cp ~/.vibedeckx/data.sqlite ~/.vibedeckx/data.sqlite.bak-pre-multisession-$(date +%s)
npx tsc --noEmit -p packages/vibedeckx/tsconfig.json
```
Expected: no TypeScript errors.

- [ ] **Step 4: Boot the backend once to run the migration, then verify schema**

```bash
pnpm dev:server &
SERVER_PID=$!
sleep 3
kill $SERVER_PID
sqlite3 ~/.vibedeckx/data.sqlite ".schema agent_sessions"
```
Expected output includes `updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP` and does **not** include `UNIQUE(project_id, branch)`.

- [ ] **Step 5: Commit**

```bash
git add packages/vibedeckx/src/storage/sqlite.ts
git commit -m "feat(db): drop unique(project,branch) on agent_sessions and add updated_at"
```

---

### Task 1.2: Remove hard-delete in `agentSessions.create`, add `updated_at`-aware methods

**Files:**
- Modify: `packages/vibedeckx/src/storage/sqlite.ts` around lines 1213-1269 (the `agentSessions` block)
- Modify: `packages/vibedeckx/src/storage/types.ts` around lines 237-249

- [ ] **Step 1: Update the Storage interface**

In `types.ts`, replace the `agentSessions:` block (lines 237-249) with:

```typescript
agentSessions: {
  create: (opts: { id: string; project_id: string; branch: string; permission_mode?: string; agent_type?: string }) => AgentSession;
  getAll: () => AgentSession[];
  getById: (id: string) => AgentSession | undefined;
  getByProjectId: (projectId: string) => AgentSession[];
  /** @deprecated — use listByBranch + getLatestByBranch */
  getByBranch: (projectId: string, branch: string) => AgentSession | undefined;
  listByBranch: (projectId: string, branch: string) => AgentSession[];
  getLatestByBranch: (projectId: string, branch: string) => AgentSession | undefined;
  updateStatus: (id: string, status: AgentSessionStatus) => void;
  updatePermissionMode: (id: string, mode: string) => void;
  updateTitle: (id: string, title: string | null) => void;
  touchUpdatedAt: (id: string) => void;
  delete: (id: string) => void;
  upsertEntry: (sessionId: string, entryIndex: number, data: string) => void;
  getEntries: (sessionId: string) => Array<{ entry_index: number; data: string }>;
  deleteEntries: (sessionId: string) => void;
};
```

Also update the `AgentSession` interface on lines 137-145 to include optional `updated_at` and `title` (the title column gets added in Phase 2, but declare it here so the type is stable):

```typescript
export interface AgentSession {
  id: string;
  project_id: string;
  branch: string;
  status: AgentSessionStatus;
  permission_mode?: string;
  agent_type?: string;
  title?: string | null;
  created_at: string;
  updated_at?: string;
}
```

- [ ] **Step 2: Replace the agentSessions storage implementation**

In `sqlite.ts`, replace the entire `agentSessions: { ... }` block (lines 1213 through the matching closing brace of that object) with:

```typescript
agentSessions: {
  create: ({ id, project_id, branch, permission_mode, agent_type }) => {
    db.prepare(
      `INSERT INTO agent_sessions (id, project_id, branch, status, permission_mode, agent_type)
       VALUES (@id, @project_id, @branch, 'running', @permission_mode, @agent_type)`
    ).run({ id, project_id, branch, permission_mode: permission_mode ?? 'edit', agent_type: agent_type ?? 'claude-code' });
    return db
      .prepare<{ id: string }, AgentSession>(`SELECT * FROM agent_sessions WHERE id = @id`)
      .get({ id })!;
  },

  getAll: () => {
    return db
      .prepare<{}, AgentSession>(`SELECT * FROM agent_sessions ORDER BY updated_at DESC`)
      .all({});
  },

  getById: (id: string) => {
    return db
      .prepare<{ id: string }, AgentSession>(`SELECT * FROM agent_sessions WHERE id = @id`)
      .get({ id });
  },

  getByProjectId: (projectId: string) => {
    return db
      .prepare<{ project_id: string }, AgentSession>(
        `SELECT * FROM agent_sessions WHERE project_id = @project_id ORDER BY updated_at DESC`
      )
      .all({ project_id: projectId });
  },

  getByBranch: (projectId: string, branch: string) => {
    return db
      .prepare<{ project_id: string; branch: string }, AgentSession>(
        `SELECT * FROM agent_sessions WHERE project_id = @project_id AND branch = @branch
         ORDER BY updated_at DESC LIMIT 1`
      )
      .get({ project_id: projectId, branch });
  },

  listByBranch: (projectId: string, branch: string) => {
    return db
      .prepare<{ project_id: string; branch: string }, AgentSession>(
        `SELECT * FROM agent_sessions WHERE project_id = @project_id AND branch = @branch
         ORDER BY updated_at DESC`
      )
      .all({ project_id: projectId, branch });
  },

  getLatestByBranch: (projectId: string, branch: string) => {
    return db
      .prepare<{ project_id: string; branch: string }, AgentSession>(
        `SELECT * FROM agent_sessions WHERE project_id = @project_id AND branch = @branch
         ORDER BY updated_at DESC LIMIT 1`
      )
      .get({ project_id: projectId, branch });
  },

  updateStatus: (id: string, status: AgentSessionStatus) => {
    db.prepare(
      `UPDATE agent_sessions SET status = @status, updated_at = CURRENT_TIMESTAMP WHERE id = @id`
    ).run({ id, status });
  },

  updatePermissionMode: (id: string, mode: string) => {
    db.prepare(
      `UPDATE agent_sessions SET permission_mode = @mode, updated_at = CURRENT_TIMESTAMP WHERE id = @id`
    ).run({ id, mode });
  },

  updateTitle: (id: string, title: string | null) => {
    db.prepare(
      `UPDATE agent_sessions SET title = @title, updated_at = CURRENT_TIMESTAMP WHERE id = @id`
    ).run({ id, title });
  },

  touchUpdatedAt: (id: string) => {
    db.prepare(`UPDATE agent_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = @id`)
      .run({ id });
  },

  delete: (id: string) => {
    db.prepare(`DELETE FROM agent_sessions WHERE id = @id`).run({ id });
  },

  upsertEntry: (sessionId: string, entryIndex: number, data: string) => {
    db.prepare(
      `INSERT INTO agent_session_entries (session_id, entry_index, data)
       VALUES (@session_id, @entry_index, @data)
       ON CONFLICT(session_id, entry_index) DO UPDATE SET data = excluded.data`
    ).run({ session_id: sessionId, entry_index: entryIndex, data });
  },

  getEntries: (sessionId: string) => {
    return db
      .prepare<{ sid: string }, { entry_index: number; data: string }>(
        `SELECT entry_index, data FROM agent_session_entries WHERE session_id = @sid ORDER BY entry_index ASC`
      )
      .all({ sid: sessionId });
  },

  deleteEntries: (sessionId: string) => {
    db.prepare(`DELETE FROM agent_session_entries WHERE session_id = @id`).run({ id: sessionId });
  },
},
```

Note: `updateTitle` references the `title` column that doesn't exist yet — Phase 2 Task 2.1 adds it. This method will throw `no such column: title` if invoked before the title migration runs. That's acceptable because no caller invokes it in Phase 1. The migration runs at server boot, so by the time any code path reaches `updateTitle`, the column exists. If you want Phase 1 to be fully standalone, move the ALTER TABLE for `title` from Task 2.1 to this step and leave `updateTitle` untouched — tradeoff is mixing Phase 2 concerns into Phase 1.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p packages/vibedeckx/tsconfig.json
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/vibedeckx/src/storage/sqlite.ts packages/vibedeckx/src/storage/types.ts
git commit -m "feat(storage): add listByBranch/getLatestByBranch/touchUpdatedAt to agentSessions"
```

---

### Task 1.3: `AgentSessionManager.createNewSession()` — always create, never reuse

**Files:**
- Modify: `packages/vibedeckx/src/agent-session-manager.ts`

- [ ] **Step 1: Add createNewSession method**

Find the existing `getOrCreateSession` method (around line 95-130). After it, add a new method:

```typescript
  /**
   * Always create a brand-new session row and spawn a process.
   * Unlike getOrCreateSession, this never reuses an existing row for the branch.
   * Used by "New Conversation" flow where the user explicitly wants a fresh conversation.
   */
  createNewSession(
    projectId: string,
    branch: string | null,
    projectPath: string,
    skipDb: boolean = false,
    permissionMode: "plan" | "edit" = "edit",
    agentType: AgentType = "claude-code",
  ): string {
    const sessionId = randomUUID();
    const branchKey = branch ?? "";

    if (!skipDb) {
      this.storage.agentSessions.create({
        id: sessionId,
        project_id: projectId,
        branch: branchKey,
        permission_mode: permissionMode,
        agent_type: agentType,
      });
    }

    const session: RunningSession = {
      id: sessionId,
      projectId,
      branch: branchKey,
      process: null,
      buffer: "",
      store: {
        entries: [],
        patches: [],
        currentAssistantIndex: null,
      },
      subscribers: new Set(),
      indexProvider: new EntryIndexProvider(),
      toolTracker: new ToolTracker(),
      status: "running",
      permissionMode,
      agentType,
      skipDb,
      dormant: false,
    };

    this.sessions.set(sessionId, session);

    // Notify provider of new session
    const provider = getProvider(agentType);
    provider.onSessionCreated?.(sessionId);

    this.spawnAgent(session, projectPath);
    console.log(`[AgentSession] createNewSession: id=${sessionId}, projectId=${projectId}, branch=${branchKey}`);
    return sessionId;
  }
```

Note: If `RunningSession` has additional required fields (inspect the interface around the top of the file), mirror the defaults used in `getOrCreateSession` for consistency.

- [ ] **Step 2: Ensure `persistEntry` also bumps `updated_at`**

Find `persistEntry` (around line 571). After the `upsertEntry` call, add:

```typescript
      if (!session.skipDb) {
        this.storage.agentSessions.touchUpdatedAt(session.id);
      }
```

(Adjust exact placement — put it inside the `if (!session.skipDb)` block that already exists around the upsertEntry call.)

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit -p packages/vibedeckx/tsconfig.json
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/vibedeckx/src/agent-session-manager.ts
git commit -m "feat(agent): add createNewSession() and touch updated_at on persistEntry"
```

---

### Task 1.4: New backend endpoints — `/new`, `?branch=` filter, `GET /by-branch`

**Files:**
- Modify: `packages/vibedeckx/src/routes/agent-session-routes.ts`

- [ ] **Step 1: Add `POST /api/projects/:projectId/agent-sessions/new` route**

After the existing `POST /api/projects/:projectId/agent-sessions` handler (around line 291), add:

```typescript
  // Create a brand-new Agent Session (explicit, always creates)
  fastify.post<{
    Params: { projectId: string };
    Body: { branch?: string | null; permissionMode?: "plan" | "edit"; agentType?: string };
  }>("/api/projects/:projectId/agent-sessions/new", async (req, reply) => {
    const userId = requireAuth(req, reply);
    if (userId === null) return;
    const project = fastify.storage.projects.getById(req.params.projectId, userId);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    const { branch, permissionMode, agentType } = req.body;
    const agentMode = project.agent_mode;
    const useRemoteAgent = agentMode !== 'local';

    if (useRemoteAgent) {
      const remoteConfig = fastify.storage.projectRemotes.getByProjectAndServer(project.id, agentMode);
      if (!remoteConfig) {
        return reply.code(400).send({ error: `Remote server configuration not found for agent_mode="${agentMode}"` });
      }
      try {
        const result = await proxyAuto(
          agentMode,
          remoteConfig.server_url ?? "",
          remoteConfig.server_api_key || "",
          "POST",
          `/api/path/agent-sessions/new`,
          { path: remoteConfig.remote_path, branch, permissionMode, agentType }
        );
        if (result.ok) {
          const remoteData = result.data as { session: { id: string }; messages: unknown[] };
          const localSessionId = `remote-${agentMode}-${project.id}-${remoteData.session.id}`;
          fastify.remoteSessionMap.set(localSessionId, {
            remoteServerId: agentMode,
            remoteUrl: remoteConfig.server_url ?? "",
            remoteApiKey: remoteConfig.server_api_key || "",
            remoteSessionId: remoteData.session.id,
            branch: branch ?? null,
          });
          return reply.code(200).send({
            session: { ...remoteData.session, id: localSessionId, projectId: req.params.projectId },
            messages: remoteData.messages,
          });
        }
        return reply.code(result.status || 502).send(result.data);
      } catch (error) {
        return reply.code(502).send({ error: `Remote agent error: ${String(error)}` });
      }
    }

    if (!project.path) {
      return reply.code(400).send({ error: "Project has no local path" });
    }

    try {
      const sessionId = fastify.agentSessionManager.createNewSession(
        req.params.projectId,
        branch ?? null,
        project.path,
        false,
        permissionMode || "edit",
        (agentType as AgentType) || "claude-code"
      );
      const session = fastify.agentSessionManager.getSession(sessionId);
      return reply.code(200).send({
        session: {
          id: sessionId,
          projectId: req.params.projectId,
          branch: branch ?? null,
          status: session?.status || "running",
          permissionMode: session?.permissionMode || "edit",
          agentType: session?.agentType || "claude-code",
        },
        messages: [],
      });
    } catch (error) {
      console.error("[API] Failed to create new agent session:", error);
      return reply.code(500).send({ error: String(error) });
    }
  });
```

- [ ] **Step 2: Add matching path-based route for remote target**

Near the existing `POST /api/path/agent-sessions` (line 49), add:

```typescript
  // Path-based: always create a new session (for remote `/new` proxy target)
  fastify.post<{
    Body: { path: string; branch?: string | null; permissionMode?: "plan" | "edit"; agentType?: string };
  }>("/api/path/agent-sessions/new", async (req, reply) => {
    const { path: projectPath, branch, permissionMode, agentType } = req.body;
    if (!projectPath) {
      return reply.code(400).send({ error: "Path is required" });
    }

    let pseudoProjectId = `path:${projectPath}`;
    if (!fastify.storage.projects.getById(pseudoProjectId)) {
      const existingByPath = fastify.storage.projects.getByPath(projectPath);
      if (existingByPath) {
        pseudoProjectId = existingByPath.id;
      } else {
        const name = projectPath.split("/").filter(Boolean).pop() || projectPath;
        try {
          fastify.storage.projects.create({ id: pseudoProjectId, name, path: projectPath });
        } catch (err: unknown) {
          if (!(err instanceof Error && err.message.includes("UNIQUE constraint failed"))) throw err;
        }
      }
    }

    const sessionId = fastify.agentSessionManager.createNewSession(
      pseudoProjectId,
      branch ?? null,
      projectPath,
      false,
      permissionMode || "edit",
      (agentType as AgentType) || "claude-code"
    );
    const session = fastify.agentSessionManager.getSession(sessionId);
    return reply.code(200).send({
      session: {
        id: sessionId,
        projectId: pseudoProjectId,
        branch: branch ?? null,
        status: session?.status || "running",
        permissionMode: session?.permissionMode || "edit",
        agentType: session?.agentType || "claude-code",
      },
      messages: [],
    });
  });
```

- [ ] **Step 3: Extend GET list endpoint with branch filter**

Modify the handler at line 118-146. Change the signature and filter logic:

```typescript
  fastify.get<{ Params: { projectId: string }; Querystring: { branch?: string } }>(
    "/api/projects/:projectId/agent-sessions",
    async (req, reply) => {
      const userId = requireAuth(req, reply);
      if (userId === null) return;
      const project = fastify.storage.projects.getById(req.params.projectId, userId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      if (!project.path && project.agent_mode === 'local') {
        return reply.code(200).send({ sessions: [] });
      }

      const dbSessions = typeof req.query.branch === "string"
        ? fastify.storage.agentSessions.listByBranch(req.params.projectId, req.query.branch)
        : fastify.storage.agentSessions.getByProjectId(req.params.projectId);

      const sessions = dbSessions.map(s => {
        const inMemory = fastify.agentSessionManager.getSession(s.id);
        if (inMemory) return { ...s, status: inMemory.status };
        if (s.status === "running") return { ...s, status: "stopped" };
        return s;
      });
      return reply.code(200).send({ sessions });
    }
  );
```

Note: Remote branch list is not proxied in phase 1 — Phase 4 covers remote UX parity. Local-only for now.

- [ ] **Step 4: Change "createOrGetSession" (existing POST) to return latest-for-branch instead of always-upserting**

The existing `POST /api/projects/:projectId/agent-sessions` at line 149 calls `agentSessionManager.getOrCreateSession()`. `getOrCreateSession` internally calls `storage.agentSessions.getByBranch()` which (per Task 1.2) now returns the latest row — behavior preserved for the common case (reload with no `?session=` resolves to most-recent). No code change needed here, but confirm by reading `getOrCreateSession` in `agent-session-manager.ts`.

- [ ] **Step 5: Type-check and smoke-test**

```bash
npx tsc --noEmit -p packages/vibedeckx/tsconfig.json
pnpm dev:server &
SERVER_PID=$!
sleep 3

# Assumes a project exists; replace PROJECT_ID with a real one from your DB
PROJECT_ID=$(sqlite3 ~/.vibedeckx/data.sqlite "SELECT id FROM projects LIMIT 1;")
curl -s -X POST "http://localhost:5173/api/projects/$PROJECT_ID/agent-sessions/new" \
  -H "Content-Type: application/json" \
  -d '{"branch":"main","permissionMode":"edit"}' | head -c 500
echo

curl -s "http://localhost:5173/api/projects/$PROJECT_ID/agent-sessions?branch=main" | head -c 500
echo
kill $SERVER_PID
```
Expected: first call returns a new sessionId; second returns an array including that session.

- [ ] **Step 6: Commit**

```bash
git add packages/vibedeckx/src/routes/agent-session-routes.ts
git commit -m "feat(api): POST /agent-sessions/new endpoint and ?branch filter on list"
```

---

### Task 1.5: Frontend — accept `sessionId` prop and `?session=` URL param

**Files:**
- Modify: `apps/vibedeckx-ui/lib/api.ts`
- Modify: `apps/vibedeckx-ui/hooks/use-agent-session.ts`
- Modify: `apps/vibedeckx-ui/app/page.tsx`
- Modify: `apps/vibedeckx-ui/components/agent/agent-conversation.tsx`

- [ ] **Step 1: Add API helpers in `lib/api.ts`**

Add to the `api` object (or as standalone exports, matching the existing style):

```typescript
// List all sessions for a (projectId, branch) pair
async function listBranchSessions(projectId: string, branch: string | null): Promise<{ sessions: Array<{ id: string; status: string; title?: string | null; created_at: string; updated_at?: string; permission_mode?: string; agent_type?: string }> }> {
  const qs = branch != null ? `?branch=${encodeURIComponent(branch)}` : "";
  const res = await authFetch(`${getApiBase()}/api/projects/${projectId}/agent-sessions${qs}`);
  if (!res.ok) throw new Error(`listBranchSessions failed: ${res.status}`);
  return res.json();
}

// Explicitly create a new session (never reuses)
async function createNewSessionApi(
  projectId: string,
  branch: string | null,
  permissionMode?: "plan" | "edit",
  agentType?: string
): Promise<{ session: { id: string; status: string; permissionMode?: string; agentType?: string }; messages: unknown[] }> {
  const res = await authFetch(`${getApiBase()}/api/projects/${projectId}/agent-sessions/new`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch, permissionMode, agentType }),
  });
  if (!res.ok) throw new Error(`createNewSession failed: ${res.status}`);
  return res.json();
}
```

Export both via the `api` object. If the project uses a centralized `api` export, add the methods inside it.

- [ ] **Step 2: Make `useAgentSession` accept optional `sessionId` prop**

In `hooks/use-agent-session.ts`, change the signature:

```typescript
interface UseAgentSessionOpts {
  sessionId?: string | null;  // Explicit session to load; if undefined, uses latest-for-branch
  onTaskCompleted?: (info: { durationMs?: number; costUsd?: number; inputTokens?: number; outputTokens?: number }) => void;
  onSessionStarted?: (session: AgentSession) => void;
}

export function useAgentSession(
  projectId: string | null,
  branch: string | null,
  agentMode: string | undefined,
  agentType: AgentType | undefined,
  opts: UseAgentSessionOpts = {}
) {
  // ... inside the init effect, change createOrGetSession call:
  // If opts.sessionId is provided, prefer GET /api/agent-sessions/:id instead of POST /projects/:projectId/agent-sessions
}
```

In the initialization effect where `createOrGetSession` is called, branch:

```typescript
if (opts.sessionId) {
  // Load this specific session (don't create)
  const res = await fetch(`${getApiBase()}/api/agent-sessions/${opts.sessionId}`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error(`Session ${opts.sessionId} not found`);
  const data = await res.json();
  setSession(data.session);
  // seed messages from data.messages as usual
} else {
  const data = await createOrGetSession(projectId, branch, permissionMode, agentType);
  setSession(data.session);
  // seed messages
}
```

Update the `sessionCache` key to include the resolved sessionId so cached entries don't collide across sessions in the same branch:

```typescript
function getCacheKey(projectId: string, branch: string | null, sessionId: string): string {
  return `${projectId}:${branch ?? ""}:${sessionId}`;
}
```

Wherever `sessionCache.set/get/delete` is called, thread the sessionId through (or skip caching when only (projectId, branch) is known — first-load path).

- [ ] **Step 3: Add `startNewConversation` to the hook; deprecate `restartSession`**

In `use-agent-session.ts`, replace the `restartSession` callback body with a new implementation:

```typescript
const startNewConversation = useCallback(async (agentType?: AgentType): Promise<string | null> => {
  if (!projectId) return null;

  // If current session is running, stop it first (caller should have confirmed)
  if (session?.status === "running" && session.id) {
    try { await stopSessionApi(session.id); } catch { /* best-effort */ }
  }

  setIsLoading(true);
  setError(null);
  try {
    const data = await createNewSessionApi(projectId, branch, session?.permissionMode, agentType ?? session?.agentType);
    return data.session.id;
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "Failed to start new conversation";
    setError(errorMsg);
    console.error("[AgentSession] startNewConversation:", e);
    return null;
  } finally {
    setIsLoading(false);
  }
}, [projectId, branch, session?.id, session?.status, session?.permissionMode, session?.agentType]);
```

Export it alongside `restartSession` (which remains for now — Phase 2 can remove it). Return value is the new sessionId so the caller can update URL.

- [ ] **Step 4: Wire URL param in `app/page.tsx`**

Near the existing query-param handling (around line 47 per grep), read `?session=`:

```typescript
const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
const urlSessionId = params.get("session"); // null if absent
```

Pass it through to `<AgentConversation ...>`. Also add a helper:

```typescript
function setSessionUrlParam(sessionId: string | null) {
  const url = new URL(window.location.href);
  if (sessionId) url.searchParams.set("session", sessionId);
  else url.searchParams.delete("session");
  window.history.replaceState(null, "", url.toString());
}
```

And export/pass `setSessionUrlParam` to `AgentConversation`.

- [ ] **Step 5: Wire the prop + URL update in `agent-conversation.tsx`**

Accept `sessionId` and `setSessionUrlParam` in the component props:

```typescript
interface AgentConversationProps {
  projectId: string;
  branch: string | null;
  sessionId?: string | null;   // NEW
  setSessionUrlParam?: (id: string | null) => void;  // NEW
  project?: Project;
  // ... existing props
}
```

Pass `sessionId` into `useAgentSession`:

```typescript
const {
  // ...
  startNewConversation,  // NEW
  // ...
} = useAgentSession(projectId, branch, project?.agent_mode, agentType, {
  sessionId,  // NEW
  onTaskCompleted,
  onSessionStarted,
});
```

Replace the existing RotateCcw button onClick (line 373) from `restartSession()` to:

```tsx
onClick={async () => {
  if (session?.status === "running") {
    const ok = window.confirm("Current conversation is running. Stop it and start a new conversation?");
    if (!ok) return;
  }
  const newId = await startNewConversation();
  if (newId && setSessionUrlParam) {
    setSessionUrlParam(newId);
    // Force a re-init: easiest path is to trigger a small state bump
    // that the hook's effect observes via the sessionId prop change.
  }
}}
```

Also listen for `setSessionUrlParam` → prop change cycle: when `sessionId` prop changes, the hook's init effect should re-run. Ensure the effect dep array in `useAgentSession` includes `opts.sessionId`.

- [ ] **Step 6: Frontend type-check + manual smoke test**

```bash
cd apps/vibedeckx-ui && npx tsc --noEmit
cd -
pnpm dev:all
```
Open http://localhost:3000, navigate to a workspace, click the "New Conversation" (RotateCcw) button:
- If there's an in-flight turn, confirm dialog appears.
- After confirming, URL gets `?session=<newId>` appended.
- Reload the page — the URL's session loads, entries are empty, you can send a fresh message.
- Manually edit URL to the old session's `?session=<oldId>` — that older conversation's history loads.

- [ ] **Step 7: Commit**

```bash
git add apps/vibedeckx-ui/lib/api.ts apps/vibedeckx-ui/hooks/use-agent-session.ts apps/vibedeckx-ui/app/page.tsx apps/vibedeckx-ui/components/agent/agent-conversation.tsx
git commit -m "feat(ui): accept ?session= URL param; New Conversation creates new session id"
```

---

## Phase 2 — Title column + default snippet + history dropdown

**Goal:** Users see a real dropdown listing all sessions for the branch, labeled with either a user-set title, the first user message snippet, or timestamp. Titles persist across reloads.

### Task 2.1: Add `title` column migration

**Files:**
- Modify: `packages/vibedeckx/src/storage/sqlite.ts`

- [ ] **Step 1: Add ALTER TABLE migration for `title`**

After the migration block from Task 1.1, add:

```typescript
const sessionInfoV4 = db.prepare("PRAGMA table_info(agent_sessions)").all() as { name: string }[];
if (!sessionInfoV4.some(col => col.name === "title")) {
  db.exec("ALTER TABLE agent_sessions ADD COLUMN title TEXT DEFAULT NULL");
}
```

Also update the fresh-DB DDL from Task 1.1 to include `title TEXT DEFAULT NULL`.

- [ ] **Step 2: Boot + verify**

```bash
pnpm dev:server &
SERVER_PID=$!
sleep 3
kill $SERVER_PID
sqlite3 ~/.vibedeckx/data.sqlite "PRAGMA table_info(agent_sessions);" | grep title
```
Expected: `title|TEXT|0||0` line visible.

- [ ] **Step 3: Commit**

```bash
git add packages/vibedeckx/src/storage/sqlite.ts
git commit -m "feat(db): add agent_sessions.title column"
```

---

### Task 2.2: `PATCH /api/agent-sessions/:sessionId/title` endpoint

**Files:**
- Modify: `packages/vibedeckx/src/routes/agent-session-routes.ts`

- [ ] **Step 1: Add route**

After the `DELETE /api/agent-sessions/:sessionId` handler (around line 606), add:

```typescript
  fastify.patch<{
    Params: { sessionId: string };
    Body: { title: string | null };
  }>("/api/agent-sessions/:sessionId/title", async (req, reply) => {
    const { title } = req.body;
    if (title !== null && (typeof title !== "string" || title.length > 200)) {
      return reply.code(400).send({ error: "title must be null or a string up to 200 chars" });
    }

    if (req.params.sessionId.startsWith("remote-")) {
      const remoteInfo = fastify.remoteSessionMap.get(req.params.sessionId);
      if (!remoteInfo) return reply.code(404).send({ error: "Remote session not found" });
      const result = await proxyAuto(
        remoteInfo.remoteServerId, remoteInfo.remoteUrl, remoteInfo.remoteApiKey,
        "PATCH", `/api/agent-sessions/${remoteInfo.remoteSessionId}/title`, { title }
      );
      return reply.code(result.status || 200).send(result.data);
    }

    const session = fastify.storage.agentSessions.getById(req.params.sessionId);
    if (!session) return reply.code(404).send({ error: "Session not found" });
    fastify.storage.agentSessions.updateTitle(req.params.sessionId, title);
    return reply.code(200).send({ success: true, title });
  });
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit -p packages/vibedeckx/tsconfig.json
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/vibedeckx/src/routes/agent-session-routes.ts
git commit -m "feat(api): PATCH /agent-sessions/:id/title"
```

---

### Task 2.3: Frontend helper for rename + history list

**Files:**
- Modify: `apps/vibedeckx-ui/lib/api.ts`

- [ ] **Step 1: Add `renameSession` helper**

```typescript
async function renameSession(sessionId: string, title: string | null): Promise<void> {
  const res = await authFetch(`${getApiBase()}/api/agent-sessions/${sessionId}/title`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`renameSession failed: ${res.status}`);
}
```

Export via the `api` object.

- [ ] **Step 2: Type-check**

```bash
cd apps/vibedeckx-ui && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/vibedeckx-ui/lib/api.ts
git commit -m "feat(ui-api): add renameSession helper"
```

---

### Task 2.4: SessionHistoryDropdown component

**Files:**
- Create: `apps/vibedeckx-ui/components/agent/session-history-dropdown.tsx`
- Modify: `apps/vibedeckx-ui/components/agent/agent-conversation.tsx`

- [ ] **Step 1: Create the dropdown component**

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { ChevronDown, Pencil, Trash2, Check, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { AgentMessage } from "@/hooks/use-agent-session";

interface SessionSummary {
  id: string;
  status: string;
  title?: string | null;
  created_at: string;
  updated_at?: string;
}

interface SessionHistoryDropdownProps {
  projectId: string;
  branch: string | null;
  currentSessionId: string | null;
  firstUserMessageByIdCache?: Map<string, string>;
  onSwitch: (sessionId: string) => void;
  onDelete?: (sessionId: string) => void;
}

export function SessionHistoryDropdown({
  projectId, branch, currentSessionId, onSwitch, onDelete,
}: SessionHistoryDropdownProps) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await api.listBranchSessions(projectId, branch);
      setSessions(data.sessions);
    } catch (e) {
      console.error("[SessionHistoryDropdown] refresh failed:", e);
    }
  }, [projectId, branch]);

  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  const handleRename = async (id: string, next: string) => {
    const title = next.trim().length > 0 ? next.trim() : null;
    try {
      await api.renameSession(id, title);
      setSessions(prev => prev.map(s => s.id === id ? { ...s, title } : s));
      setEditingId(null);
      toast.success("Renamed");
    } catch (e) {
      toast.error("Rename failed");
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this conversation? This cannot be undone.")) return;
    try {
      await api.deleteSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      onDelete?.(id);
      toast.success("Deleted");
    } catch (e) {
      toast.error("Delete failed");
      console.error(e);
    }
  };

  const label = (s: SessionSummary): string => {
    if (s.title && s.title.trim().length > 0) return s.title;
    // TODO phase-later: firstUserMessage snippet via optional passthrough
    return s.updated_at ? new Date(s.updated_at).toLocaleString() : new Date(s.created_at).toLocaleString();
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1">
          History <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 max-h-96 overflow-y-auto">
        {sessions.length === 0 && (
          <div className="px-2 py-3 text-xs text-muted-foreground">No history yet.</div>
        )}
        {sessions.map(s => {
          const isCurrent = s.id === currentSessionId;
          const editing = editingId === s.id;
          return (
            <DropdownMenuItem
              key={s.id}
              onSelect={(e) => {
                if (editing) e.preventDefault();
                else if (!isCurrent) onSwitch(s.id);
              }}
              className="flex items-center gap-2 group"
            >
              <div className="flex-1 min-w-0">
                {editing ? (
                  <div className="flex items-center gap-1">
                    <Input
                      value={editingValue}
                      onChange={e => setEditingValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") handleRename(s.id, editingValue);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                      className="h-6 text-xs"
                    />
                    <button onClick={(e) => { e.stopPropagation(); handleRename(s.id, editingValue); }}>
                      <Check className="h-3 w-3" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }}>
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div
                    className="truncate text-xs"
                    title={`${s.updated_at ? new Date(s.updated_at).toLocaleString() : new Date(s.created_at).toLocaleString()} • status: ${s.status}`}
                  >
                    {isCurrent ? "● " : ""}
                    {label(s)}
                  </div>
                )}
              </div>
              {!editing && (
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(s.id);
                      setEditingValue(s.title ?? "");
                    }}
                    className="p-1 hover:bg-muted rounded"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                    className="p-1 hover:bg-muted rounded text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </DropdownMenuItem>
          );
        })}
        {sessions.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onSelect={refresh} className="text-xs text-muted-foreground">
          Refresh
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Mount the dropdown in `agent-conversation.tsx`**

Just before the existing RotateCcw button (line 370), add:

```tsx
<SessionHistoryDropdown
  projectId={projectId}
  branch={branch}
  currentSessionId={session?.id ?? null}
  onSwitch={(id) => {
    // URL-first: updating URL triggers the hook re-init via sessionId prop
    setSessionUrlParam?.(id);
    // Force a re-render so the hook sees the new prop; the hook effect handles teardown/reconnect.
  }}
  onDelete={(id) => {
    if (id === session?.id) {
      // Current was deleted — redirect to most-recent remaining, or clear URL
      api.listBranchSessions(projectId, branch).then(res => {
        const next = res.sessions.find(s => s.id !== id);
        setSessionUrlParam?.(next ? next.id : null);
      });
    }
  }}
/>
```

- [ ] **Step 3: Auto-set title from first user message**

In `agent-session-manager.ts`, in `sendUserMessage` (or `pushEntry` when `entry.type === "user"`), if the session's DB title is null and this is the first user-typed entry, persist a snippet. Simpler: do it in `persistEntry` inside the `if (entry.type === "user" && !session.skipDb)` branch:

```typescript
// If no title set yet, seed from this first user message
const dbRow = this.storage.agentSessions.getById(session.id);
if (dbRow && (dbRow.title === null || dbRow.title === undefined)) {
  const text = typeof entry.content === "string"
    ? entry.content
    : entry.content.filter(p => p.type === "text").map(p => (p as { text: string }).text).join(" ");
  const snippet = text.trim().slice(0, 60) + (text.length > 60 ? "…" : "");
  this.storage.agentSessions.updateTitle(session.id, snippet);
}
```

Only run this on the first user entry, guarded by the `title === null` check.

- [ ] **Step 4: Type-check both ends**

```bash
npx tsc --noEmit -p packages/vibedeckx/tsconfig.json
cd apps/vibedeckx-ui && npx tsc --noEmit && cd -
```
Expected: no errors.

- [ ] **Step 5: Manual smoke test**

1. Start both servers: `pnpm dev:all`.
2. Create a workspace, send a message like "fix login bug in auth module".
3. Open the History dropdown — should show one item titled "fix login bug in auth module" (or truncated).
4. Click "New Conversation" — new item appears, becomes current.
5. Open dropdown again, hover the old one, click pencil, rename to "OLD". Confirm.
6. Switch to the renamed one via click — URL changes, history loads.

- [ ] **Step 6: Commit**

```bash
git add apps/vibedeckx-ui/components/agent/session-history-dropdown.tsx apps/vibedeckx-ui/components/agent/agent-conversation.tsx packages/vibedeckx/src/agent-session-manager.ts
git commit -m "feat(ui): SessionHistoryDropdown with rename + auto-title from first user message"
```

---

## Phase 3 — Delete parity and robustness

**Goal:** Delete a session from the dropdown safely (stops running, cleans in-memory, redirects), and ensure reload/crash recovery reads the right session.

### Task 3.1: Harden DELETE endpoint

**Files:**
- Modify: `packages/vibedeckx/src/agent-session-manager.ts` (`deleteSession` around line 795)
- Verify: `packages/vibedeckx/src/routes/agent-session-routes.ts` (DELETE route around line 606)

- [ ] **Step 1: Ensure `deleteSession` kills process and clears entries**

Read `deleteSession` (should already call `stopSession`). Verify it also does:

```typescript
this.storage.agentSessions.deleteEntries(sessionId);
this.storage.agentSessions.delete(sessionId);
this.sessions.delete(sessionId);
// Broadcast a terminal WS event so any lingering subscribers disconnect cleanly
this.broadcastRaw(sessionId, { finished: true });
```

If `deleteSession` lacks any of these lines, add them in that order.

- [ ] **Step 2: Add `deleteSession` helper in frontend `api.ts` (if not present)**

```typescript
async function deleteSession(sessionId: string): Promise<void> {
  const res = await authFetch(`${getApiBase()}/api/agent-sessions/${sessionId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`deleteSession failed: ${res.status}`);
}
```

Export on the `api` object.

- [ ] **Step 3: Manual test**

Using the dropdown UI from Phase 2:
1. Have 3 sessions. Click delete on a non-current one — it disappears.
2. Click delete on the current one — frontend auto-redirects via `onDelete` handler to another.
3. Delete all — dropdown shows "No history yet"; URL `?session` param gets cleared; main area shows empty state.

- [ ] **Step 4: Commit**

```bash
git add packages/vibedeckx/src/agent-session-manager.ts apps/vibedeckx-ui/lib/api.ts
git commit -m "feat: harden session deletion (stop, clear entries, broadcast finished)"
```

---

### Task 3.2: `restoreSessionsFromDb` + getOrCreateSession with multi-row branches

**Files:**
- Modify: `packages/vibedeckx/src/agent-session-manager.ts`

- [ ] **Step 1: Verify `restoreSessionsFromDb` doesn't dedupe by branch**

Read around line 1046. The restore loop should iterate every row in `storage.agentSessions.getAll()` and create a dormant in-memory `RunningSession` for each. Confirm that nothing in the loop prevents multiple rows for the same branch from coexisting. If there's a `Map<branchKey, session>` anywhere, remove or replace with `Map<sessionId, session>`.

- [ ] **Step 2: Audit `getOrCreateSession` for multi-session correctness**

Read `getOrCreateSession` (around line 95-130). Old behavior: `storage.agentSessions.getByBranch()` returned one row (the only one). New behavior: it returns latest. That's the desired behavior for "workspace open with no ?session=" (load most recent). No change needed **unless** `getOrCreateSession` also checks `this.sessions` Map by branch — it should key by `sessionId` only.

Search and fix any `Array.from(this.sessions.values()).find(s => s.branch === ...)` patterns that implicitly assume uniqueness.

- [ ] **Step 3: Type-check + smoke-test restart recovery**

```bash
npx tsc --noEmit -p packages/vibedeckx/tsconfig.json
```

Manual: start server, create 2 sessions in one branch, send one message to each. Kill the server (`Ctrl+C`). Restart `pnpm dev:server`. In the browser, open the workspace with `?session=<second>` — history should load. Remove `?session` from URL — defaults to most recent (which is the last-active one).

- [ ] **Step 4: Commit**

```bash
git add packages/vibedeckx/src/agent-session-manager.ts
git commit -m "fix(agent): ensure session manager keys by id not branch for multi-session"
```

---

## Phase 4 — Remote parity + polish

**Goal:** Everything works when the project's `agent_mode` is a remote server. Minor UX polish (tooltips, keyboard, empty state text).

### Task 4.1: Remote proxy for `listBranchSessions` and `renameSession`

**Files:**
- Modify: `packages/vibedeckx/src/routes/agent-session-routes.ts`

- [ ] **Step 1: Make the list endpoint remote-aware**

The current list handler only queries local DB. For remote workspaces we need to proxy to the remote. Update the GET handler (Task 1.4 Step 3):

```typescript
  fastify.get<{ Params: { projectId: string }; Querystring: { branch?: string } }>(
    "/api/projects/:projectId/agent-sessions",
    async (req, reply) => {
      const userId = requireAuth(req, reply);
      if (userId === null) return;
      const project = fastify.storage.projects.getById(req.params.projectId, userId);
      if (!project) return reply.code(404).send({ error: "Project not found" });

      const useRemoteAgent = project.agent_mode !== "local";
      if (useRemoteAgent) {
        const remoteConfig = fastify.storage.projectRemotes.getByProjectAndServer(project.id, project.agent_mode);
        if (!remoteConfig) return reply.code(200).send({ sessions: [] });
        const qs = req.query.branch ? `?branch=${encodeURIComponent(req.query.branch)}` : "";
        const result = await proxyAuto(
          project.agent_mode, remoteConfig.server_url ?? "", remoteConfig.server_api_key || "",
          "GET", `/api/projects/_path/${encodeURIComponent(remoteConfig.remote_path)}/agent-sessions${qs}`
        );
        // Prefix returned session IDs with remote- so the FE sees consistent IDs
        if (result.ok) {
          const data = result.data as { sessions: Array<{ id: string; status: string; [k: string]: unknown }> };
          const mapped = data.sessions.map(s => ({
            ...s,
            id: `remote-${project.agent_mode}-${project.id}-${s.id}`,
          }));
          return reply.code(200).send({ sessions: mapped });
        }
        return reply.code(result.status || 502).send(result.data);
      }

      if (!project.path) return reply.code(200).send({ sessions: [] });

      const dbSessions = typeof req.query.branch === "string"
        ? fastify.storage.agentSessions.listByBranch(req.params.projectId, req.query.branch)
        : fastify.storage.agentSessions.getByProjectId(req.params.projectId);
      const sessions = dbSessions.map(s => {
        const inMemory = fastify.agentSessionManager.getSession(s.id);
        if (inMemory) return { ...s, status: inMemory.status };
        if (s.status === "running") return { ...s, status: "stopped" };
        return s;
      });
      return reply.code(200).send({ sessions });
    }
  );
```

Add a matching path-based remote handler if needed:

```typescript
  fastify.get<{ Params: { '*': string }; Querystring: { branch?: string } }>(
    "/api/projects/_path/:star(*)/agent-sessions",
    async (req, reply) => {
      const projectPath = "/" + (req.params['*'] || "").replace(/^\/+/, "");
      const project = fastify.storage.projects.getByPath(projectPath);
      if (!project) return reply.code(200).send({ sessions: [] });
      const dbSessions = typeof req.query.branch === "string"
        ? fastify.storage.agentSessions.listByBranch(project.id, req.query.branch)
        : fastify.storage.agentSessions.getByProjectId(project.id);
      return reply.code(200).send({ sessions: dbSessions });
    }
  );
```

Note: The path-segment route style is an approximation — check the codebase for the existing `path:` pseudo-id approach (used in `POST /api/path/agent-sessions`) and match. A simpler alternative is to have the remote recognize `path:` pseudo-ids already and use `GET /api/projects/path:<encoded>/agent-sessions` directly — confirm by reading `projects.getById("path:...")`.

- [ ] **Step 2: PATCH title already handles remote (Task 2.2)**

Confirm the PATCH route's remote branch works. The `remote-` prefix handler proxies as-is; remote backend's PATCH handler processes it locally. No change needed.

- [ ] **Step 3: Manual test with remote project**

If a remote server is configured: open a workspace whose project uses a remote. Create multiple sessions. Confirm dropdown lists remote sessions with correctly-prefixed `remote-*` IDs, rename works, switch works, delete works.

- [ ] **Step 4: Commit**

```bash
git add packages/vibedeckx/src/routes/agent-session-routes.ts
git commit -m "feat(remote): proxy branch session list through to remote server"
```

---

### Task 4.2: Polish — tooltips, keyboard, empty state

**Files:**
- Modify: `apps/vibedeckx-ui/components/agent/session-history-dropdown.tsx`
- Modify: `apps/vibedeckx-ui/components/agent/agent-conversation.tsx`

- [ ] **Step 1: Add message-count to dropdown tooltip**

The GET list endpoint doesn't return message counts today. Add it server-side:

In `agent-session-routes.ts`, extend the list response to include `entry_count`:

```typescript
const counts = fastify.storage.db.prepare(
  `SELECT session_id, COUNT(*) as cnt FROM agent_session_entries GROUP BY session_id`
).all() as { session_id: string; cnt: number }[];
const countMap = new Map(counts.map(r => [r.session_id, r.cnt]));
const sessions = dbSessions.map(s => ({
  ...s,
  status: (fastify.agentSessionManager.getSession(s.id)?.status) ?? s.status,
  entry_count: countMap.get(s.id) ?? 0,
}));
```

Note: `storage.db` may not be exposed — if so, add a `countEntries()` method to `agentSessions` in Task 1.2's storage block instead and use that here:

```typescript
countEntries: () => {
  return db.prepare<{}, { session_id: string; cnt: number }>(
    `SELECT session_id, COUNT(*) as cnt FROM agent_session_entries GROUP BY session_id`
  ).all({});
},
```

Then in the route:

```typescript
const countMap = new Map(fastify.storage.agentSessions.countEntries().map(r => [r.session_id, r.cnt]));
```

In `SessionHistoryDropdown`, update the `title` attribute (tooltip) on the row div to include the count:

```tsx
title={`${s.updated_at ? new Date(s.updated_at).toLocaleString() : ""} • ${s.entry_count ?? 0} messages • status: ${s.status}`}
```

- [ ] **Step 2: Show running badge**

Render a tiny dot next to running sessions:

```tsx
{s.status === "running" && (
  <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1" title="Running" />
)}
```

- [ ] **Step 3: Empty-state polish**

In `agent-conversation.tsx`, when `!session && session-list is empty`, display "Start a new conversation" as the placeholder input prompt (the existing empty state already handles this in the non-multi-session world — just verify it still triggers correctly when `urlSessionId` is set to a nonexistent id).

- [ ] **Step 4: Type-check + smoke test**

```bash
npx tsc --noEmit -p packages/vibedeckx/tsconfig.json
cd apps/vibedeckx-ui && npx tsc --noEmit && cd -
pnpm dev:all
```
Hover items in the dropdown — tooltip shows "timestamp • N messages • status".

- [ ] **Step 5: Commit**

```bash
git add apps/vibedeckx-ui/components/agent/session-history-dropdown.tsx apps/vibedeckx-ui/components/agent/agent-conversation.tsx packages/vibedeckx/src/routes/agent-session-routes.ts packages/vibedeckx/src/storage/sqlite.ts packages/vibedeckx/src/storage/types.ts
git commit -m "feat(ui): tooltip with message count + running indicator in history dropdown"
```

---

### Task 4.3: Clean-up — remove old `restartSession` wiring from UI

**Files:**
- Modify: `apps/vibedeckx-ui/hooks/use-agent-session.ts`
- Modify: `apps/vibedeckx-ui/components/agent/agent-conversation.tsx`

- [ ] **Step 1: Remove `restartSession` export from the hook**

Delete the `restartSession` callback (around line 692 in use-agent-session.ts) and remove it from the return object (around line 877). Remove the `restartSessionApi` helper (line 141-151) — no callers remain.

- [ ] **Step 2: Update consumers**

Grep for `restartSession` in the `apps/vibedeckx-ui` tree and remove any remaining references (likely only `agent-conversation.tsx`, already switched to `startNewConversation` in Phase 1).

```bash
cd apps/vibedeckx-ui && rg "restartSession" && cd -
```
Expected: no matches. If any, replace with `startNewConversation`.

- [ ] **Step 3: Remove the backend route `/restart` only if safe**

Check the backend `/api/agent-sessions/:sessionId/restart` handler (line 422). If no external consumer (CLI, external scripts) calls it, remove it. Otherwise leave as-is. Check CHANGELOG / docs.

```bash
rg "agent-sessions.*restart" --type ts
```
If only the backend route definition shows up, delete the handler.

- [ ] **Step 4: Type-check + smoke test**

```bash
npx tsc --noEmit -p packages/vibedeckx/tsconfig.json
cd apps/vibedeckx-ui && npx tsc --noEmit && cd -
```
Manual: full end-to-end — create multiple sessions, switch, rename, delete, reload browser, restart server, confirm everything still works.

- [ ] **Step 5: Commit**

```bash
git add apps/vibedeckx-ui/hooks/use-agent-session.ts apps/vibedeckx-ui/components/agent/agent-conversation.tsx packages/vibedeckx/src/routes/agent-session-routes.ts
git commit -m "chore: remove deprecated restartSession path in favor of startNewConversation"
```

---

## Self-Review Notes

**Coverage vs. decisions:**
- Concurrency A + don't-kill-on-switch → Tasks 1.1/1.2/3.2 (multi-row DB + session manager audit). ✅
- New Conversation = stop + create new → Task 1.5 Step 5 (confirmation + `startNewConversation`). ✅
- Labels (e) → Task 2.1 + 2.4 Step 3 (title column, auto-snippet, rename UI). ✅
- URL routing → Task 1.5 Steps 4/5 (`?session=` param + setter). ✅
- Delete support → Task 3.1 + 2.4 (delete handler + redirect on current-delete). ✅
- Ordering → Task 1.2 (all reads ORDER BY updated_at DESC). ✅
- Empty state → Task 4.2 Step 3 (existing empty path). ✅
- Remote parity → Task 4.1. ✅

**Risks / known gaps:**
1. Task 1.5 Step 2 uses a hand-wavy "the hook re-inits when `sessionId` prop changes". The actual implementation has to tear down the old WebSocket and open a new one — verify the useEffect dep array includes `opts.sessionId` AND the teardown function closes the current WS. If not, switching will leave two subscribers alive.
2. Task 1.1 Step 2 assumes `PRAGMA foreign_keys = OFF` is the default. Verify on first boot; if it's ON, wrap the rebuild in `PRAGMA foreign_keys = OFF; ... PRAGMA foreign_keys = ON;` or use `DEFERRED` transactions.
3. Task 4.1 "remote list proxy" uses a speculative path template (`/api/projects/_path/...`). Real implementation may prefer reusing the existing `path:` pseudo-id convention — verify by reading `storage.projects.getById("path:/some/path")` behavior before coding.
4. Auto-title truncation at 60 chars is a guess — adjust after seeing actual examples.
5. "Don't kill on switch" intentionally allows orphan processes. Not handled in this plan; a follow-up could add idle-timeout reaping.

---

**Plan complete and saved to `docs/plans/2026-04-19-multi-session-per-workspace.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
