# Worktree Selector for Project Cards

## Overview

Replace the file list in project cards with a dropdown to select git worktrees. When selected, executors run from that worktree directory. Selection is session-only (React state).

## Requirements

- Show all worktrees for a project via dropdown
- Display as relative paths (main worktree shown as ".")
- Include branch name in parentheses when available
- Executor commands run from selected worktree directory
- Works after project is moved (git stores worktrees with relative paths via `worktree.useRelativePaths`)

## Backend API

### New Endpoint: `GET /api/projects/:id/worktrees`

**Logic:**
1. Get project path from database
2. Run `git worktree list --porcelain` in project directory
3. Parse output to extract worktree paths and branch names
4. Convert absolute paths to relative paths (relative to project root)
5. Return array of worktree objects

**Response:**
```typescript
{
  worktrees: [
    { path: ".", branch: "main" },
    { path: "../.worktrees/feature-x", branch: "feature-x" }
  ]
}
```

**Error handling:** If not a git repo or command fails, return `{ worktrees: [{ path: ".", branch: null }] }`.

### Updated Endpoint: `POST /api/executors/:id/start`

**Request body:**
```typescript
{ worktreePath?: string }  // e.g., "../.worktrees/feature-x"
```

Backend resolves `project.path + worktreePath` to get absolute cwd for process.

## Frontend Changes

### project-card.tsx

- Replace `api.getProjectFiles()` with `api.getProjectWorktrees()`
- Add `selectedWorktree` state (defaults to ".")
- Replace `<FileList>` with `<Select>` dropdown
- Pass `selectedWorktree` to `ExecutorPanel`

### executor-panel.tsx

- Accept `selectedWorktree` prop
- Pass worktree path when calling `startExecutor()`

### use-executors.ts

- Update `startExecutor()` to accept optional worktree path parameter

### api.ts

- Add `getProjectWorktrees(projectId)` function
- Update `startExecutor()` to accept worktree path

## Files to Modify

| File | Changes |
|------|---------|
| `packages/vibedeckx/src/server.ts` | Add worktrees endpoint |
| `apps/vibedeckx-ui/lib/api.ts` | Add `getProjectWorktrees()`, update `startExecutor()` |
| `apps/vibedeckx-ui/components/project/project-card.tsx` | Worktree dropdown, selection state |
| `apps/vibedeckx-ui/components/executor/executor-panel.tsx` | Accept and use `selectedWorktree` prop |
| `apps/vibedeckx-ui/hooks/use-executors.ts` | Update `startExecutor()` signature |

## Files to Delete

- `components/project/file-list.tsx` - No longer needed

## No Database Changes Required

Selection is session-only (React state), not persisted.
