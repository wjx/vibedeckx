# Worktree Selector Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the file list in project cards with a worktree dropdown that controls where executors run.

**Architecture:** Backend endpoint runs `git worktree list --porcelain`, parses output, converts to relative paths. Frontend stores selection in React state, passes to executor start calls.

**Tech Stack:** Fastify (backend), React/Next.js (frontend), Radix UI Select, node child_process

---

## Task 1: Add Backend Worktrees Endpoint

**Files:**
- Modify: `packages/vibedeckx/src/server.ts:189-216` (after files endpoint)

**Step 1: Add the worktrees endpoint**

Add after the `/api/projects/:id/files` endpoint (line 216):

```typescript
// 获取项目的 git worktrees
server.get<{ Params: { id: string } }>("/api/projects/:id/worktrees", async (req, reply) => {
  const project = opts.storage.projects.getById(req.params.id);
  if (!project) {
    return reply.code(404).send({ error: "Project not found" });
  }

  try {
    const { execSync } = await import("child_process");
    const output = execSync("git worktree list --porcelain", {
      cwd: project.path,
      encoding: "utf-8",
    });

    const worktrees: Array<{ path: string; branch: string | null }> = [];
    const blocks = output.trim().split("\n\n");

    for (const block of blocks) {
      const lines = block.split("\n");
      let worktreePath = "";
      let branch: string | null = null;

      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          worktreePath = line.slice(9);
        } else if (line.startsWith("branch refs/heads/")) {
          branch = line.slice(18);
        }
      }

      if (worktreePath) {
        // Convert absolute path to relative path from project root
        const relativePath = path.relative(project.path, worktreePath) || ".";
        worktrees.push({ path: relativePath, branch });
      }
    }

    // If no worktrees found, return project root as fallback
    if (worktrees.length === 0) {
      worktrees.push({ path: ".", branch: null });
    }

    return reply.code(200).send({ worktrees });
  } catch (error) {
    // Not a git repo or git command failed - return project root only
    return reply.code(200).send({ worktrees: [{ path: ".", branch: null }] });
  }
});
```

**Step 2: Add execSync import**

The `execSync` is dynamically imported in the handler, so no top-level import needed.

**Step 3: Test manually**

Run: `curl http://localhost:5173/api/projects/<project-id>/worktrees`
Expected: JSON with worktrees array

**Step 4: Commit**

```bash
git add packages/vibedeckx/src/server.ts
git commit -m "feat(api): add worktrees endpoint"
```

---

## Task 2: Add Frontend API Function

**Files:**
- Modify: `apps/vibedeckx-ui/lib/api.ts:46-49` (add type)
- Modify: `apps/vibedeckx-ui/lib/api.ts:124-132` (add function)
- Modify: `apps/vibedeckx-ui/lib/api.ts:190-200` (update startExecutor)

**Step 1: Add Worktree type after DirectoryEntry (line 49)**

```typescript
export interface Worktree {
  path: string;
  branch: string | null;
}
```

**Step 2: Add getProjectWorktrees function after getProjectFiles (line 132)**

```typescript
async getProjectWorktrees(id: string): Promise<Worktree[]> {
  const res = await fetch(`${getApiBase()}/api/projects/${id}/worktrees`);
  if (!res.ok) {
    return [{ path: ".", branch: null }];
  }
  const data = await res.json();
  return data.worktrees;
},
```

**Step 3: Update startExecutor to accept worktreePath (line 190-200)**

Change from:
```typescript
async startExecutor(executorId: string): Promise<string> {
  const res = await fetch(`${getApiBase()}/api/executors/${executorId}/start`, {
    method: "POST",
  });
```

To:
```typescript
async startExecutor(executorId: string, worktreePath?: string): Promise<string> {
  const res = await fetch(`${getApiBase()}/api/executors/${executorId}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ worktreePath }),
  });
```

**Step 4: Commit**

```bash
git add apps/vibedeckx-ui/lib/api.ts
git commit -m "feat(api): add worktree API functions"
```

---

## Task 3: Update Backend Start Executor to Accept worktreePath

**Files:**
- Modify: `packages/vibedeckx/src/server.ts:286-299`

**Step 1: Update the start executor endpoint**

Change from:
```typescript
server.post<{ Params: { id: string } }>("/api/executors/:id/start", async (req, reply) => {
  const executor = opts.storage.executors.getById(req.params.id);
  if (!executor) {
    return reply.code(404).send({ error: "Executor not found" });
  }

  const project = opts.storage.projects.getById(executor.project_id);
  if (!project) {
    return reply.code(404).send({ error: "Project not found" });
  }

  const processId = processManager.start(executor, project.path);
  return reply.code(200).send({ processId });
});
```

To:
```typescript
server.post<{ Params: { id: string }; Body: { worktreePath?: string } }>("/api/executors/:id/start", async (req, reply) => {
  const executor = opts.storage.executors.getById(req.params.id);
  if (!executor) {
    return reply.code(404).send({ error: "Executor not found" });
  }

  const project = opts.storage.projects.getById(executor.project_id);
  if (!project) {
    return reply.code(404).send({ error: "Project not found" });
  }

  // Resolve worktree path to absolute path
  const worktreePath = req.body?.worktreePath;
  const basePath = worktreePath && worktreePath !== "."
    ? path.resolve(project.path, worktreePath)
    : project.path;

  const processId = processManager.start(executor, basePath);
  return reply.code(200).send({ processId });
});
```

**Step 2: Commit**

```bash
git add packages/vibedeckx/src/server.ts
git commit -m "feat(api): support worktreePath in executor start"
```

---

## Task 4: Update useExecutors Hook

**Files:**
- Modify: `apps/vibedeckx-ui/hooks/use-executors.ts:103-116`

**Step 1: Update startExecutor to accept worktreePath**

Change from:
```typescript
// Start executor
const startExecutor = useCallback(async (executorId: string) => {
  try {
    const processId = await api.startExecutor(executorId);
```

To:
```typescript
// Start executor
const startExecutor = useCallback(async (executorId: string, worktreePath?: string) => {
  try {
    const processId = await api.startExecutor(executorId, worktreePath);
```

**Step 2: Commit**

```bash
git add apps/vibedeckx-ui/hooks/use-executors.ts
git commit -m "feat(hooks): pass worktreePath to startExecutor"
```

---

## Task 5: Replace FileList with Worktree Dropdown in ProjectCard

**Files:**
- Modify: `apps/vibedeckx-ui/components/project/project-card.tsx`

**Step 1: Replace the entire file content**

```typescript
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FolderOpen, Calendar, GitBranch } from "lucide-react";
import { api, type Project, type Worktree } from "@/lib/api";

interface ProjectCardProps {
  project: Project;
  selectedWorktree: string;
  onWorktreeChange: (path: string) => void;
}

export function ProjectCard({ project, selectedWorktree, onWorktreeChange }: ProjectCardProps) {
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [loading, setLoading] = useState(true);
  const createdDate = new Date(project.created_at).toLocaleDateString();

  useEffect(() => {
    api.getProjectWorktrees(project.id)
      .then((wts) => {
        setWorktrees(wts);
        // If current selection not in list, reset to first
        if (wts.length > 0 && !wts.some(w => w.path === selectedWorktree)) {
          onWorktreeChange(wts[0].path);
        }
      })
      .catch(() => setWorktrees([{ path: ".", branch: null }]))
      .finally(() => setLoading(false));
  }, [project.id, selectedWorktree, onWorktreeChange]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{project.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FolderOpen className="h-4 w-4" />
          <span className="truncate">{project.path}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>{createdDate}</span>
        </div>
        <div className="border-t pt-2">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading worktrees...</div>
          ) : (
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedWorktree} onValueChange={onWorktreeChange}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select worktree" />
                </SelectTrigger>
                <SelectContent>
                  {worktrees.map((wt) => (
                    <SelectItem key={wt.path} value={wt.path}>
                      {wt.path}
                      {wt.branch && (
                        <span className="text-muted-foreground ml-2">({wt.branch})</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Commit**

```bash
git add apps/vibedeckx-ui/components/project/project-card.tsx
git commit -m "feat(ui): replace file list with worktree dropdown"
```

---

## Task 6: Update Main Page to Pass Worktree State

**Files:**
- Modify: `apps/vibedeckx-ui/app/page.tsx:29-47` (add state)
- Modify: `apps/vibedeckx-ui/app/page.tsx:136-140` (update ProjectCard usage)
- Modify: `apps/vibedeckx-ui/app/page.tsx:214` (update ExecutorPanel usage)

**Step 1: Add worktree state after line 39 (createDialogOpen state)**

```typescript
const [selectedWorktree, setSelectedWorktree] = useState(".");
```

**Step 2: Reset worktree when project changes - add useEffect after useProjects hook (after line 47)**

```typescript
// Reset worktree selection when project changes
useEffect(() => {
  setSelectedWorktree(".");
}, [currentProject?.id]);
```

Add `useEffect` to imports (line 2):
```typescript
import { useState, useEffect } from 'react';
```

**Step 3: Update ProjectCard usage (line 138)**

Change from:
```typescript
<ProjectCard project={currentProject} />
```

To:
```typescript
<ProjectCard
  project={currentProject}
  selectedWorktree={selectedWorktree}
  onWorktreeChange={setSelectedWorktree}
/>
```

**Step 4: Update ExecutorPanel usage (line 214)**

Change from:
```typescript
<ExecutorPanel projectId={currentProject?.id ?? null} />
```

To:
```typescript
<ExecutorPanel
  projectId={currentProject?.id ?? null}
  selectedWorktree={selectedWorktree}
/>
```

**Step 5: Commit**

```bash
git add apps/vibedeckx-ui/app/page.tsx
git commit -m "feat(ui): wire worktree state through page"
```

---

## Task 7: Update ExecutorPanel to Use Worktree

**Files:**
- Modify: `apps/vibedeckx-ui/components/executor/executor-panel.tsx:11-13` (props)
- Modify: `apps/vibedeckx-ui/components/executor/executor-panel.tsx:66-75` (ExecutorItem)

**Step 1: Update props interface (line 11-13)**

Change from:
```typescript
interface ExecutorPanelProps {
  projectId: string | null;
}
```

To:
```typescript
interface ExecutorPanelProps {
  projectId: string | null;
  selectedWorktree?: string;
}
```

**Step 2: Destructure selectedWorktree in component (line 15)**

Change from:
```typescript
export function ExecutorPanel({ projectId }: ExecutorPanelProps) {
```

To:
```typescript
export function ExecutorPanel({ projectId, selectedWorktree }: ExecutorPanelProps) {
```

**Step 3: Update ExecutorItem onStart handler (line 70)**

Change from:
```typescript
onStart={() => startExecutor(executor.id)}
```

To:
```typescript
onStart={() => startExecutor(executor.id, selectedWorktree)}
```

**Step 4: Commit**

```bash
git add apps/vibedeckx-ui/components/executor/executor-panel.tsx
git commit -m "feat(ui): pass worktree to executor start"
```

---

## Task 8: Delete Unused FileList Component

**Files:**
- Delete: `apps/vibedeckx-ui/components/project/file-list.tsx`

**Step 1: Delete the file**

```bash
rm apps/vibedeckx-ui/components/project/file-list.tsx
```

**Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove unused file-list component"
```

---

## Task 9: Manual Testing

**Step 1: Start the development servers**

```bash
pnpm dev
```

**Step 2: Test worktree dropdown**

1. Open http://localhost:3000
2. Select a project that has git worktrees
3. Verify the dropdown shows all worktrees with relative paths
4. Verify "." appears for the main worktree with branch name

**Step 3: Test executor runs from selected worktree**

1. Select a worktree from dropdown
2. Start an executor (e.g., `pwd` command)
3. Verify the output shows the worktree's absolute path

**Step 4: Test fallback for non-git projects**

1. Create a project in a non-git directory
2. Verify dropdown shows only "." option
