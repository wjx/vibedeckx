# Workspace Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ProjectCard in workspace left panel with a rules list that stores per-workspace natural language rules and injects them into the chat AI's system prompt.

**Architecture:** New `rules` SQLite table scoped by project+branch. Backend CRUD routes follow the existing task-routes pattern. Frontend `useRules` hook + `RulesList` component replaces `ProjectCard` in the workspace view. `ChatSessionManager.getSystemPrompt()` appends enabled rules.

**Tech Stack:** SQLite (better-sqlite3), Fastify routes, React hooks, shadcn/ui Dialog + Checkbox, Tailwind CSS v4

---

### Task 1: Add Rule type and Storage interface

**Files:**
- Modify: `packages/vibedeckx/src/storage/types.ts:96-236`

- [ ] **Step 1: Add Rule interface and storage methods**

Add after the `Task` interface (line 110) in `packages/vibedeckx/src/storage/types.ts`:

```typescript
export interface Rule {
  id: string;
  project_id: string;
  branch: string | null;
  name: string;
  content: string;
  enabled: number;
  position: number;
  created_at: string;
  updated_at: string;
}
```

Then add to the `Storage` interface, before the `close` method (line 235):

```typescript
  rules: {
    create: (opts: { id: string; project_id: string; branch: string | null; name: string; content: string; enabled?: boolean }) => Rule;
    getByWorkspace: (projectId: string, branch: string | null) => Rule[];
    getById: (id: string) => Rule | undefined;
    update: (id: string, opts: { name?: string; content?: string; enabled?: boolean; position?: number }) => Rule | undefined;
    delete: (id: string) => void;
    reorder: (projectId: string, branch: string | null, orderedIds: string[]) => void;
  };
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit -p packages/vibedeckx/tsconfig.json`
Expected: Fails because `sqlite.ts` doesn't implement the new `rules` storage yet (that's Task 2). The type error should reference `rules` missing from the returned object.

- [ ] **Step 3: Commit**

```bash
git add packages/vibedeckx/src/storage/types.ts
git commit -m "feat: add Rule type and storage interface"
```

---

### Task 2: Implement SQLite rules storage

**Files:**
- Modify: `packages/vibedeckx/src/storage/sqlite.ts:1-6` (import), `~86` (schema), `~1338` (implementation)

- [ ] **Step 1: Add Rule to imports**

In `packages/vibedeckx/src/storage/sqlite.ts` line 6, add `Rule` to the type import:

```typescript
import type { Project, Executor, ExecutorGroup, ExecutorProcess, ExecutorProcessStatus, ExecutorType, PromptProvider, AgentSession, AgentSessionStatus, Task, TaskStatus, TaskPriority, Rule, Storage, ExecutionMode, SyncButtonConfig, RemoteServer, RemoteServerConnectionMode, RemoteServerStatus, ProjectRemote, ProjectRemoteWithServer } from "./types.js";
```

- [ ] **Step 2: Add rules table to schema**

Add after the `tasks` table creation (around line 86, after the closing `);` of the tasks CREATE TABLE):

```sql
    CREATE TABLE IF NOT EXISTS rules (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      branch TEXT,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
```

- [ ] **Step 3: Add rules storage implementation**

Add before the `close` method (around line 1338, before `close: () => {`):

```typescript
    rules: {
      create: ({ id, project_id, branch, name, content, enabled }) => {
        const maxPos = db.prepare<{ project_id: string; branch: string | null }, { max_pos: number | null }>(
          `SELECT MAX(position) as max_pos FROM rules WHERE project_id = @project_id AND (branch IS @branch OR (branch IS NULL AND @branch IS NULL))`
        ).get({ project_id, branch: branch ?? null });
        const position = (maxPos?.max_pos ?? -1) + 1;

        db.prepare(
          `INSERT INTO rules (id, project_id, branch, name, content, enabled, position)
           VALUES (@id, @project_id, @branch, @name, @content, @enabled, @position)`
        ).run({
          id,
          project_id,
          branch: branch ?? null,
          name,
          content,
          enabled: enabled === false ? 0 : 1,
          position,
        });

        return db
          .prepare<{ id: string }, Rule>(`SELECT * FROM rules WHERE id = @id`)
          .get({ id })!;
      },

      getByWorkspace: (projectId: string, branch: string | null) => {
        return db
          .prepare<{ project_id: string; branch: string | null }, Rule>(
            `SELECT * FROM rules WHERE project_id = @project_id AND (branch IS @branch OR (branch IS NULL AND @branch IS NULL)) ORDER BY position ASC`
          )
          .all({ project_id: projectId, branch: branch ?? null });
      },

      getById: (id: string) => {
        return db
          .prepare<{ id: string }, Rule>(`SELECT * FROM rules WHERE id = @id`)
          .get({ id });
      },

      update: (id: string, opts: { name?: string; content?: string; enabled?: boolean; position?: number }) => {
        const updates: string[] = [];
        const params: Record<string, unknown> = { id };

        if (opts.name !== undefined) {
          updates.push('name = @name');
          params.name = opts.name;
        }
        if (opts.content !== undefined) {
          updates.push('content = @content');
          params.content = opts.content;
        }
        if (opts.enabled !== undefined) {
          updates.push('enabled = @enabled');
          params.enabled = opts.enabled ? 1 : 0;
        }
        if (opts.position !== undefined) {
          updates.push('position = @position');
          params.position = opts.position;
        }

        if (updates.length === 0) {
          return db.prepare<{ id: string }, Rule>(`SELECT * FROM rules WHERE id = @id`).get({ id });
        }

        updates.push('updated_at = datetime(\'now\')');
        db.prepare(`UPDATE rules SET ${updates.join(', ')} WHERE id = @id`).run(params);
        return db.prepare<{ id: string }, Rule>(`SELECT * FROM rules WHERE id = @id`).get({ id });
      },

      delete: (id: string) => {
        db.prepare(`DELETE FROM rules WHERE id = @id`).run({ id });
      },

      reorder: (projectId: string, branch: string | null, orderedIds: string[]) => {
        const transaction = db.transaction(() => {
          for (let i = 0; i < orderedIds.length; i++) {
            db.prepare(
              `UPDATE rules SET position = @position, updated_at = datetime('now') WHERE id = @id AND project_id = @project_id`
            ).run({ id: orderedIds[i], project_id: projectId, position: i });
          }
        });
        transaction();
      },
    },
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit -p packages/vibedeckx/tsconfig.json`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/vibedeckx/src/storage/sqlite.ts
git commit -m "feat: implement SQLite rules storage"
```

---

### Task 3: Add rule REST routes

**Files:**
- Create: `packages/vibedeckx/src/routes/rule-routes.ts`
- Modify: `packages/vibedeckx/src/server.ts:21-22` (import), `~212-213` (register)

- [ ] **Step 1: Create rule-routes.ts**

Create `packages/vibedeckx/src/routes/rule-routes.ts`:

```typescript
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { randomUUID } from "crypto";
import { requireAuth } from "../server.js";
import "../server-types.js";

const routes: FastifyPluginAsync = async (fastify) => {
  // List rules for a workspace (project + branch)
  fastify.get<{ Params: { projectId: string }; Querystring: { branch?: string } }>(
    "/api/projects/:projectId/rules",
    async (req, reply) => {
      const userId = requireAuth(req, reply);
      if (userId === null) return;
      const project = fastify.storage.projects.getById(req.params.projectId, userId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const branch = req.query.branch ?? null;
      const rules = fastify.storage.rules.getByWorkspace(req.params.projectId, branch);
      return reply.code(200).send({ rules });
    }
  );

  // Create rule
  fastify.post<{
    Params: { projectId: string };
    Body: { branch?: string | null; name: string; content: string; enabled?: boolean };
  }>("/api/projects/:projectId/rules", async (req, reply) => {
    const userId = requireAuth(req, reply);
    if (userId === null) return;
    const project = fastify.storage.projects.getById(req.params.projectId, userId);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    const { branch, name, content, enabled } = req.body;
    if (!name || !content) {
      return reply.code(400).send({ error: "name and content are required" });
    }

    const id = randomUUID();
    const rule = fastify.storage.rules.create({
      id,
      project_id: req.params.projectId,
      branch: branch ?? null,
      name,
      content,
      enabled,
    });

    return reply.code(201).send({ rule });
  });

  // Update rule
  fastify.put<{
    Params: { id: string };
    Body: { name?: string; content?: string; enabled?: boolean; position?: number };
  }>("/api/rules/:id", async (req, reply) => {
    const existing = fastify.storage.rules.getById(req.params.id);
    if (!existing) {
      return reply.code(404).send({ error: "Rule not found" });
    }

    const rule = fastify.storage.rules.update(req.params.id, {
      name: req.body.name,
      content: req.body.content,
      enabled: req.body.enabled,
      position: req.body.position,
    });
    return reply.code(200).send({ rule });
  });

  // Delete rule
  fastify.delete<{ Params: { id: string } }>("/api/rules/:id", async (req, reply) => {
    const existing = fastify.storage.rules.getById(req.params.id);
    if (!existing) {
      return reply.code(404).send({ error: "Rule not found" });
    }

    fastify.storage.rules.delete(req.params.id);
    return reply.code(200).send({ success: true });
  });

  // Reorder rules
  fastify.put<{
    Params: { projectId: string };
    Querystring: { branch?: string };
    Body: { orderedIds: string[] };
  }>("/api/projects/:projectId/rules/reorder", async (req, reply) => {
    const userId = requireAuth(req, reply);
    if (userId === null) return;
    const project = fastify.storage.projects.getById(req.params.projectId, userId);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return reply.code(400).send({ error: "orderedIds must be an array" });
    }

    const branch = req.query.branch ?? null;
    fastify.storage.rules.reorder(req.params.projectId, branch, orderedIds);
    return reply.code(200).send({ success: true });
  });
};

export default fp(routes, { name: "rule-routes" });
```

- [ ] **Step 2: Register routes in server.ts**

In `packages/vibedeckx/src/server.ts`, add the import after line 21 (`import taskRoutes`):

```typescript
import ruleRoutes from "./routes/rule-routes.js";
```

Add the registration after line 213 (`server.register(taskRoutes);`):

```typescript
  server.register(ruleRoutes);
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit -p packages/vibedeckx/tsconfig.json`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/vibedeckx/src/routes/rule-routes.ts packages/vibedeckx/src/server.ts
git commit -m "feat: add rule REST routes"
```

---

### Task 4: Inject rules into chat AI system prompt

**Files:**
- Modify: `packages/vibedeckx/src/chat-session-manager.ts:751-772`

- [ ] **Step 1: Modify getSystemPrompt to include rules**

Replace the `getSystemPrompt` method (lines 751-772) in `packages/vibedeckx/src/chat-session-manager.ts`:

```typescript
  private getSystemPrompt(projectId: string, branch: string | null): string {
    const lines = [
      "You are a helpful assistant for a software development workspace.",
      "You can check the status of running executors (dev servers, build processes, etc.) using the getExecutorStatus tool.",
      "You can start executors using the runExecutor tool and stop them using the stopExecutor tool.",
      "When the user asks about running processes, errors, build status, or dev server status, use the getExecutorStatus tool.",
      "When the user asks to start, run, or launch a process, use runExecutor. When they ask to stop or kill a process, use stopExecutor.",
      "You can view the coding agent's conversation history using the getAgentConversation tool.",
      "When the user asks about what the agent is doing, has done, or references agent activities, use this tool.",
      "When you receive an [Executor Event] message, respond in 1-2 sentences only. State what finished, whether it succeeded or failed, and the key detail (e.g. error message) if it failed. Do not repeat the output logs.",
      "You can list active terminal sessions using the listTerminals tool.",
      "You can send commands to a terminal using the runInTerminal tool. The command runs visibly in the user's terminal and returns immediately.",
      "After sending a command, terminal output will arrive as a [Terminal Event] message once the command finishes. Wait for it before commenting on results.",
      "When the user asks to run a command, check something in the terminal, or interact with a shell, use these tools.",
      "If no terminals are open, suggest the user open one in the Terminal tab first.",
      "You can open web pages in the preview browser using the openPreview tool.",
      "You can interact with pages: clickElement, fillInput, selectOption, pressKey.",
      "You can inspect pages: screenshot (returns base64 image), getPageContent (returns text/HTML), waitForElement.",
      "When you receive a [Browser Event] message, respond in 1-2 sentences. State what error occurred and suggest a fix if obvious.",
      `Current workspace: project=${projectId}, branch=${branch ?? "default"}.`,
    ];

    // Inject workspace rules
    const rules = this.storage.rules.getByWorkspace(projectId, branch);
    const enabledRules = rules.filter(r => r.enabled);
    if (enabledRules.length > 0) {
      lines.push("");
      lines.push("## Workspace Rules");
      lines.push("The user has configured the following rules for this workspace. Follow them:");
      enabledRules.forEach((rule, i) => {
        lines.push(`${i + 1}. [${rule.name}]: ${rule.content}`);
      });
    }

    return lines.join("\n");
  }
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit -p packages/vibedeckx/tsconfig.json`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/vibedeckx/src/chat-session-manager.ts
git commit -m "feat: inject workspace rules into chat AI system prompt"
```

---

### Task 5: Add Rule type and API methods to frontend

**Files:**
- Modify: `apps/vibedeckx-ui/lib/api.ts`

- [ ] **Step 1: Add Rule interface**

Add after the `Task` interface (around line 250) in `apps/vibedeckx-ui/lib/api.ts`:

```typescript
export interface Rule {
  id: string;
  project_id: string;
  branch: string | null;
  name: string;
  content: string;
  enabled: number;
  position: number;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Add API methods**

Add after the `reorderTasks` method (around line 880) in the `api` object:

```typescript
  async getRules(projectId: string, branch: string | null): Promise<Rule[]> {
    const params = new URLSearchParams();
    if (branch) params.set("branch", branch);
    const qs = params.toString();
    const res = await authFetch(`${getApiBase()}/api/projects/${projectId}/rules${qs ? `?${qs}` : ""}`);
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error);
    }
    const data = await res.json();
    return data.rules;
  },

  async createRule(
    projectId: string,
    opts: { branch: string | null; name: string; content: string; enabled?: boolean }
  ): Promise<Rule> {
    const res = await authFetch(`${getApiBase()}/api/projects/${projectId}/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error);
    }
    const data = await res.json();
    return data.rule;
  },

  async updateRule(
    id: string,
    opts: { name?: string; content?: string; enabled?: boolean; position?: number }
  ): Promise<Rule> {
    const res = await authFetch(`${getApiBase()}/api/rules/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error);
    }
    const data = await res.json();
    return data.rule;
  },

  async deleteRule(id: string): Promise<void> {
    const res = await authFetch(`${getApiBase()}/api/rules/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error);
    }
  },
```

- [ ] **Step 3: Verify frontend types compile**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/vibedeckx-ui/lib/api.ts
git commit -m "feat: add Rule type and API methods to frontend"
```

---

### Task 6: Create useRules hook

**Files:**
- Create: `apps/vibedeckx-ui/hooks/use-rules.ts`

- [ ] **Step 1: Create the hook**

Create `apps/vibedeckx-ui/hooks/use-rules.ts`:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { api, type Rule } from "@/lib/api";

export function useRules(projectId: string | null, branch: string | null) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRules = useCallback(async () => {
    if (!projectId) {
      setRules([]);
      setLoading(false);
      return;
    }

    try {
      const data = await api.getRules(projectId, branch);
      setRules(data);
    } catch (error) {
      console.error("Failed to fetch rules:", error);
    } finally {
      setLoading(false);
    }
  }, [projectId, branch]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const createRule = useCallback(
    async (opts: { name: string; content: string; enabled?: boolean }) => {
      if (!projectId) return null;

      try {
        const rule = await api.createRule(projectId, { ...opts, branch });
        setRules((prev) => [...prev, rule]);
        return rule;
      } catch (error) {
        console.error("Failed to create rule:", error);
        return null;
      }
    },
    [projectId, branch]
  );

  const updateRule = useCallback(
    async (id: string, opts: { name?: string; content?: string; enabled?: boolean }) => {
      const previousRules = rules;
      setRules((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...opts, enabled: opts.enabled !== undefined ? (opts.enabled ? 1 : 0) : r.enabled, updated_at: new Date().toISOString() } : r))
      );

      try {
        const rule = await api.updateRule(id, opts);
        setRules((prev) => prev.map((r) => (r.id === id ? rule : r)));
        return rule;
      } catch (error) {
        console.error("Failed to update rule:", error);
        setRules(previousRules);
        return null;
      }
    },
    [rules]
  );

  const deleteRule = useCallback(async (id: string) => {
    const previousRules = rules;
    setRules((prev) => prev.filter((r) => r.id !== id));

    try {
      await api.deleteRule(id);
    } catch (error) {
      console.error("Failed to delete rule:", error);
      setRules(previousRules);
    }
  }, [rules]);

  return {
    rules,
    loading,
    createRule,
    updateRule,
    deleteRule,
    refetch: fetchRules,
  };
}
```

- [ ] **Step 2: Verify frontend types compile**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/vibedeckx-ui/hooks/use-rules.ts
git commit -m "feat: create useRules hook"
```

---

### Task 7: Create RuleDialog component

**Files:**
- Create: `apps/vibedeckx-ui/components/rules/rule-dialog.tsx`

- [ ] **Step 1: Create the dialog component**

Create `apps/vibedeckx-ui/components/rules/rule-dialog.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2 } from "lucide-react";
import type { Rule } from "@/lib/api";

interface RuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule?: Rule | null;
  onSave: (data: { name: string; content: string; enabled: boolean }) => void;
  onDelete?: (id: string) => void;
}

export function RuleDialog({ open, onOpenChange, rule, onSave, onDelete }: RuleDialogProps) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (open) {
      setName(rule?.name ?? "");
      setContent(rule?.content ?? "");
      setEnabled(rule ? rule.enabled === 1 : true);
    }
  }, [open, rule]);

  const handleSave = () => {
    if (!name.trim() || !content.trim()) return;
    onSave({ name: name.trim(), content: content.trim(), enabled });
    onOpenChange(false);
  };

  const isEdit = !!rule;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Rule" : "Add Rule"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Auto-commit on finish"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Rule</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="e.g. When the coding agent finishes, run git commit executor"
              rows={3}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="rule-enabled"
              checked={enabled}
              onCheckedChange={(checked) => setEnabled(checked === true)}
            />
            <label htmlFor="rule-enabled" className="text-sm">Enabled</label>
          </div>
        </div>
        <DialogFooter className="flex justify-between">
          <div>
            {isEdit && onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  onDelete(rule!.id);
                  onOpenChange(false);
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!name.trim() || !content.trim()}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify frontend types compile**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/vibedeckx-ui/components/rules/rule-dialog.tsx
git commit -m "feat: create RuleDialog component"
```

---

### Task 8: Create RulesList component

**Files:**
- Create: `apps/vibedeckx-ui/components/rules/rules-list.tsx`

- [ ] **Step 1: Create the rules list component**

Create `apps/vibedeckx-ui/components/rules/rules-list.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus } from "lucide-react";
import { RuleDialog } from "./rule-dialog";
import type { Rule } from "@/lib/api";

interface RulesListProps {
  rules: Rule[];
  onCreateRule: (opts: { name: string; content: string; enabled?: boolean }) => Promise<Rule | null>;
  onUpdateRule: (id: string, opts: { name?: string; content?: string; enabled?: boolean }) => Promise<Rule | null>;
  onDeleteRule: (id: string) => Promise<void>;
}

export function RulesList({ rules, onCreateRule, onUpdateRule, onDeleteRule }: RulesListProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);

  const handleAdd = () => {
    setEditingRule(null);
    setDialogOpen(true);
  };

  const handleEdit = (rule: Rule) => {
    setEditingRule(rule);
    setDialogOpen(true);
  };

  const handleSave = async (data: { name: string; content: string; enabled: boolean }) => {
    if (editingRule) {
      await onUpdateRule(editingRule.id, data);
    } else {
      await onCreateRule(data);
    }
  };

  const handleToggle = async (rule: Rule, checked: boolean) => {
    await onUpdateRule(rule.id, { enabled: checked });
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Rules</span>
        <Button variant="ghost" size="icon-sm" className="h-6 w-6" onClick={handleAdd} title="Add rule">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {rules.length === 0 ? (
        <button
          onClick={handleAdd}
          className="w-full text-center py-3 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          No rules yet. Click to add one.
        </button>
      ) : (
        <div className="space-y-0.5 max-h-48 overflow-y-auto">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-muted/50 group cursor-pointer"
              onClick={() => handleEdit(rule)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="shrink-0"
              >
                <Checkbox
                  checked={rule.enabled === 1}
                  onCheckedChange={(checked) => handleToggle(rule, checked === true)}
                />
              </div>
              <span
                className={`text-sm truncate flex-1 ${rule.enabled === 1 ? "text-foreground" : "text-muted-foreground line-through"}`}
                title={rule.content}
              >
                {rule.name}
              </span>
            </div>
          ))}
        </div>
      )}
      <RuleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        rule={editingRule}
        onSave={handleSave}
        onDelete={async (id) => { await onDeleteRule(id); }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify frontend types compile**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/vibedeckx-ui/components/rules/rules-list.tsx
git commit -m "feat: create RulesList component"
```

---

### Task 9: Replace ProjectCard with RulesList in workspace view

**Files:**
- Modify: `apps/vibedeckx-ui/app/page.tsx:2-3` (imports), `~288-300` (workspace left panel)

- [ ] **Step 1: Update imports**

In `apps/vibedeckx-ui/app/page.tsx`, remove the `ProjectCard` import (line 3):

```typescript
import { ProjectCard } from '@/components/project/project-card';
```

Add imports for `RulesList` and `useRules`:

```typescript
import { RulesList } from '@/components/rules/rules-list';
import { useRules } from '@/hooks/use-rules';
```

- [ ] **Step 2: Add useRules hook call**

Add after the `useSessionStatuses` call (around line 76):

```typescript
  const { rules, createRule, updateRule, deleteRule } = useRules(currentProject?.id ?? null, selectedBranch);
```

- [ ] **Step 3: Replace ProjectCard with RulesList in workspace left panel**

Replace the ProjectCard block (lines 288-300):

```tsx
                  {currentProject && (
                    <div className="px-4 py-3 border-b border-border/60 flex-shrink-0">
                      <ProjectCard
                        project={currentProject}
                        selectedBranch={selectedBranch}
                        onSyncPrompt={handleSyncPrompt}
                        assignedTask={assignedTask}
                        onStartTask={handleStartTask}
                        onResetTask={handleResetTask}
                        startingTask={startingTask}
                      />
                    </div>
                  )}
```

With:

```tsx
                  {currentProject && (
                    <div className="px-4 py-3 border-b border-border/60 flex-shrink-0">
                      <RulesList
                        rules={rules}
                        onCreateRule={createRule}
                        onUpdateRule={updateRule}
                        onDeleteRule={deleteRule}
                      />
                    </div>
                  )}
```

- [ ] **Step 4: Verify frontend types compile**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Verify lint passes**

Run: `pnpm --filter vibedeckx-ui lint`
Expected: PASS (or only pre-existing warnings)

- [ ] **Step 6: Commit**

```bash
git add apps/vibedeckx-ui/app/page.tsx
git commit -m "feat: replace ProjectCard with RulesList in workspace view"
```

---

### Task 10: Manual smoke test

- [ ] **Step 1: Build backend**

Run: `pnpm build:main`
Expected: PASS

- [ ] **Step 2: Build frontend**

Run: `pnpm build:ui`
Expected: PASS

- [ ] **Step 3: Verify full build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 4: Commit (if any fixes needed)**

Only if previous steps required fixes.
