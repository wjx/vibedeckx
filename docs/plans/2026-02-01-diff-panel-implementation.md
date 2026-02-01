# Diff Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Diff panel to display uncommitted git changes, accessible via tab switching in the right panel.

**Architecture:** Tab-based right panel containing ExecutorPanel and DiffPanel. Backend parses `git diff` output into structured JSON. Frontend renders unified diff with syntax highlighting.

**Tech Stack:** Fastify (backend), React + shadcn/ui (frontend), Tailwind CSS

---

### Task 1: Add Diff Types to API Client

**Files:**
- Modify: `apps/vibedeckx-ui/lib/api.ts:39-88`

**Step 1: Add TypeScript interfaces**

Add after line 88 (after `InputMessage` type):

```typescript
export interface DiffLine {
  type: 'context' | 'add' | 'delete';
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed';
  oldPath?: string;
  hunks: DiffHunk[];
}

export interface DiffResponse {
  files: FileDiff[];
}
```

**Step 2: Add getDiff method to api object**

Add after `getRunningProcesses` method (around line 250):

```typescript
  async getDiff(projectId: string, worktreePath?: string): Promise<DiffResponse> {
    const params = new URLSearchParams();
    if (worktreePath) {
      params.set('worktreePath', worktreePath);
    }
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`${getApiBase()}/api/projects/${projectId}/diff${query}`);
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error);
    }
    return res.json();
  },
```

**Step 3: Commit**

```bash
git add apps/vibedeckx-ui/lib/api.ts
git commit -m "feat(api): add diff types and getDiff method"
```

---

### Task 2: Add Backend Diff Endpoint

**Files:**
- Modify: `packages/vibedeckx/src/server.ts:307-373`

**Step 1: Add diff parsing helper function**

Add before the `// ==================== Executor API ====================` comment (around line 375):

```typescript
  // ==================== Git Diff API ====================

  function parseDiffOutput(diffOutput: string): Array<{
    path: string;
    status: 'modified' | 'added' | 'deleted' | 'renamed';
    oldPath?: string;
    hunks: Array<{
      oldStart: number;
      oldLines: number;
      newStart: number;
      newLines: number;
      lines: Array<{
        type: 'context' | 'add' | 'delete';
        content: string;
        oldLineNo?: number;
        newLineNo?: number;
      }>;
    }>;
  }> {
    const files: Array<{
      path: string;
      status: 'modified' | 'added' | 'deleted' | 'renamed';
      oldPath?: string;
      hunks: Array<{
        oldStart: number;
        oldLines: number;
        newStart: number;
        newLines: number;
        lines: Array<{
          type: 'context' | 'add' | 'delete';
          content: string;
          oldLineNo?: number;
          newLineNo?: number;
        }>;
      }>;
    }> = [];

    if (!diffOutput.trim()) {
      return files;
    }

    // Split by "diff --git" to get each file's diff
    const fileDiffs = diffOutput.split(/^diff --git /m).filter(Boolean);

    for (const fileDiff of fileDiffs) {
      const lines = fileDiff.split('\n');
      if (lines.length === 0) continue;

      // Parse file header: "a/path b/path"
      const headerMatch = lines[0].match(/a\/(.+?) b\/(.+)/);
      if (!headerMatch) continue;

      const oldPath = headerMatch[1];
      const newPath = headerMatch[2];

      // Determine status
      let status: 'modified' | 'added' | 'deleted' | 'renamed' = 'modified';
      let finalPath = newPath;
      let finalOldPath: string | undefined;

      for (const line of lines.slice(1, 10)) {
        if (line.startsWith('new file mode')) {
          status = 'added';
          break;
        } else if (line.startsWith('deleted file mode')) {
          status = 'deleted';
          break;
        } else if (line.startsWith('rename from')) {
          status = 'renamed';
          finalOldPath = oldPath;
          break;
        }
      }

      // Parse hunks
      const hunks: Array<{
        oldStart: number;
        oldLines: number;
        newStart: number;
        newLines: number;
        lines: Array<{
          type: 'context' | 'add' | 'delete';
          content: string;
          oldLineNo?: number;
          newLineNo?: number;
        }>;
      }> = [];

      let currentHunk: typeof hunks[0] | null = null;
      let oldLineNo = 0;
      let newLineNo = 0;

      for (const line of lines) {
        // Match hunk header: @@ -oldStart,oldLines +newStart,newLines @@
        const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (hunkMatch) {
          if (currentHunk) {
            hunks.push(currentHunk);
          }
          const oldStart = parseInt(hunkMatch[1], 10);
          const oldLines = parseInt(hunkMatch[2] || '1', 10);
          const newStart = parseInt(hunkMatch[3], 10);
          const newLines = parseInt(hunkMatch[4] || '1', 10);

          currentHunk = {
            oldStart,
            oldLines,
            newStart,
            newLines,
            lines: [],
          };
          oldLineNo = oldStart;
          newLineNo = newStart;
          continue;
        }

        if (!currentHunk) continue;

        if (line.startsWith('+') && !line.startsWith('+++')) {
          currentHunk.lines.push({
            type: 'add',
            content: line.slice(1),
            newLineNo: newLineNo++,
          });
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          currentHunk.lines.push({
            type: 'delete',
            content: line.slice(1),
            oldLineNo: oldLineNo++,
          });
        } else if (line.startsWith(' ')) {
          currentHunk.lines.push({
            type: 'context',
            content: line.slice(1),
            oldLineNo: oldLineNo++,
            newLineNo: newLineNo++,
          });
        }
      }

      if (currentHunk) {
        hunks.push(currentHunk);
      }

      files.push({
        path: finalPath,
        status,
        ...(finalOldPath && { oldPath: finalOldPath }),
        hunks,
      });
    }

    return files;
  }
```

**Step 2: Add the diff endpoint**

Add after the parseDiffOutput function:

```typescript
  // Get git diff for uncommitted changes
  server.get<{
    Params: { id: string };
    Querystring: { worktreePath?: string };
  }>("/api/projects/:id/diff", async (req, reply) => {
    const project = opts.storage.projects.getById(req.params.id);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    const worktreePath = req.query.worktreePath;
    const cwd = worktreePath && worktreePath !== "."
      ? path.resolve(project.path, worktreePath)
      : project.path;

    try {
      const { execSync } = await import("child_process");

      // Get diff for both staged and unstaged changes
      const diffOutput = execSync("git diff HEAD --no-color", {
        cwd,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      });

      const files = parseDiffOutput(diffOutput);
      return reply.code(200).send({ files });
    } catch (error) {
      // If HEAD doesn't exist (new repo), try diff without HEAD
      try {
        const { execSync } = await import("child_process");
        const diffOutput = execSync("git diff --no-color", {
          cwd,
          encoding: "utf-8",
          maxBuffer: 10 * 1024 * 1024,
        });
        const files = parseDiffOutput(diffOutput);
        return reply.code(200).send({ files });
      } catch {
        return reply.code(200).send({ files: [] });
      }
    }
  });
```

**Step 3: Commit**

```bash
git add packages/vibedeckx/src/server.ts
git commit -m "feat(api): add git diff endpoint with unified diff parsing"
```

---

### Task 3: Create useDiff Hook

**Files:**
- Create: `apps/vibedeckx-ui/hooks/use-diff.ts`

**Step 1: Create the hook file**

```typescript
import { useState, useCallback } from 'react';
import { api, type DiffResponse } from '@/lib/api';

export function useDiff(projectId: string | null, worktreePath?: string) {
  const [diff, setDiff] = useState<DiffResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setDiff(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await api.getDiff(projectId, worktreePath);
      setDiff(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load diff');
      setDiff(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, worktreePath]);

  return {
    diff,
    loading,
    error,
    refresh,
  };
}
```

**Step 2: Commit**

```bash
git add apps/vibedeckx-ui/hooks/use-diff.ts
git commit -m "feat(hooks): add useDiff hook for fetching git diff"
```

---

### Task 4: Create DiffLine Component

**Files:**
- Create: `apps/vibedeckx-ui/components/diff/diff-line.tsx`

**Step 1: Create the component**

```typescript
import { cn } from '@/lib/utils';
import type { DiffLine as DiffLineType } from '@/lib/api';

interface DiffLineProps {
  line: DiffLineType;
}

export function DiffLine({ line }: DiffLineProps) {
  const prefix = line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' ';

  return (
    <div
      className={cn(
        'flex font-mono text-sm',
        line.type === 'add' && 'bg-green-900/30 text-green-400',
        line.type === 'delete' && 'bg-red-900/30 text-red-400'
      )}
    >
      <span className="w-12 flex-shrink-0 text-right pr-2 text-muted-foreground select-none border-r border-border">
        {line.oldLineNo ?? ''}
      </span>
      <span className="w-12 flex-shrink-0 text-right pr-2 text-muted-foreground select-none border-r border-border">
        {line.newLineNo ?? ''}
      </span>
      <span className="w-6 flex-shrink-0 text-center select-none">
        {prefix}
      </span>
      <span className="flex-1 whitespace-pre overflow-x-auto">{line.content}</span>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/vibedeckx-ui/components/diff/diff-line.tsx
git commit -m "feat(diff): add DiffLine component for rendering diff lines"
```

---

### Task 5: Create FileDiff Component

**Files:**
- Create: `apps/vibedeckx-ui/components/diff/file-diff.tsx`

**Step 1: Create the component**

```typescript
import { Badge } from '@/components/ui/badge';
import { DiffLine } from './diff-line';
import type { FileDiff as FileDiffType } from '@/lib/api';

interface FileDiffProps {
  file: FileDiffType;
}

const statusColors = {
  modified: 'bg-yellow-500/20 text-yellow-500',
  added: 'bg-green-500/20 text-green-500',
  deleted: 'bg-red-500/20 text-red-500',
  renamed: 'bg-blue-500/20 text-blue-500',
};

const statusLabels = {
  modified: 'Modified',
  added: 'Added',
  deleted: 'Deleted',
  renamed: 'Renamed',
};

export function FileDiff({ file }: FileDiffProps) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 bg-muted border-b">
        <span className="font-mono text-sm flex-1">
          {file.oldPath && file.status === 'renamed' ? (
            <>
              <span className="text-muted-foreground">{file.oldPath}</span>
              <span className="mx-2">→</span>
              {file.path}
            </>
          ) : (
            file.path
          )}
        </span>
        <Badge variant="secondary" className={statusColors[file.status]}>
          {statusLabels[file.status]}
        </Badge>
      </div>
      <div className="overflow-x-auto">
        {file.hunks.map((hunk, hunkIndex) => (
          <div key={hunkIndex}>
            <div className="px-4 py-1 bg-muted/50 text-muted-foreground text-sm font-mono">
              @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
            </div>
            {hunk.lines.map((line, lineIndex) => (
              <DiffLine key={lineIndex} line={line} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/vibedeckx-ui/components/diff/file-diff.tsx
git commit -m "feat(diff): add FileDiff component for rendering file diffs"
```

---

### Task 6: Create DiffPanel Component

**Files:**
- Create: `apps/vibedeckx-ui/components/diff/diff-panel.tsx`

**Step 1: Create the component**

```typescript
'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RefreshCw, GitBranch } from 'lucide-react';
import { FileDiff } from './file-diff';
import { useDiff } from '@/hooks/use-diff';

interface DiffPanelProps {
  projectId: string | null;
  selectedWorktree?: string;
}

export function DiffPanel({ projectId, selectedWorktree }: DiffPanelProps) {
  const { diff, loading, error, refresh } = useDiff(projectId, selectedWorktree);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!projectId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Select a project to view changes</p>
        </div>
      </div>
    );
  }

  const fileCount = diff?.files.length ?? 0;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-4">
          <h2 className="font-semibold">Uncommitted Changes</h2>
          {fileCount > 0 && (
            <span className="text-sm text-muted-foreground">
              {fileCount} file{fileCount !== 1 ? 's' : ''} changed
            </span>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {loading && !diff ? (
            <div className="text-center text-muted-foreground py-8">
              Loading changes...
            </div>
          ) : error ? (
            <div className="text-center text-red-400 py-8">
              {error}
            </div>
          ) : fileCount === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <p>No uncommitted changes</p>
              <p className="text-sm mt-1">
                All changes have been committed
              </p>
            </div>
          ) : (
            diff?.files.map((file, index) => (
              <FileDiff key={index} file={file} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/vibedeckx-ui/components/diff/diff-panel.tsx
git commit -m "feat(diff): add DiffPanel component with refresh functionality"
```

---

### Task 7: Create Diff Index Export

**Files:**
- Create: `apps/vibedeckx-ui/components/diff/index.ts`

**Step 1: Create the index file**

```typescript
export { DiffPanel } from './diff-panel';
export { FileDiff } from './file-diff';
export { DiffLine } from './diff-line';
```

**Step 2: Commit**

```bash
git add apps/vibedeckx-ui/components/diff/index.ts
git commit -m "feat(diff): add barrel export for diff components"
```

---

### Task 8: Create RightPanel Component with Tabs

**Files:**
- Create: `apps/vibedeckx-ui/components/right-panel/right-panel.tsx`

**Step 1: Create the component**

```typescript
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Terminal, GitBranch } from 'lucide-react';
import { ExecutorPanel } from '@/components/executor';
import { DiffPanel } from '@/components/diff';

interface RightPanelProps {
  projectId: string | null;
  selectedWorktree?: string;
}

type TabType = 'executors' | 'diff';

export function RightPanel({ projectId, selectedWorktree }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('executors');

  return (
    <div className="h-full flex flex-col">
      {/* Tab Bar */}
      <div className="flex border-b h-14">
        <button
          onClick={() => setActiveTab('executors')}
          className={cn(
            'flex items-center gap-2 px-4 border-b-2 transition-colors',
            activeTab === 'executors'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Terminal className="h-4 w-4" />
          Executors
        </button>
        <button
          onClick={() => setActiveTab('diff')}
          className={cn(
            'flex items-center gap-2 px-4 border-b-2 transition-colors',
            activeTab === 'diff'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <GitBranch className="h-4 w-4" />
          Diff
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'executors' ? (
          <ExecutorPanel
            projectId={projectId}
            selectedWorktree={selectedWorktree}
          />
        ) : (
          <DiffPanel
            projectId={projectId}
            selectedWorktree={selectedWorktree}
          />
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/vibedeckx-ui/components/right-panel/right-panel.tsx
git commit -m "feat(right-panel): add RightPanel with tab switching"
```

---

### Task 9: Create RightPanel Index Export

**Files:**
- Create: `apps/vibedeckx-ui/components/right-panel/index.ts`

**Step 1: Create the index file**

```typescript
export { RightPanel } from './right-panel';
```

**Step 2: Commit**

```bash
git add apps/vibedeckx-ui/components/right-panel/index.ts
git commit -m "feat(right-panel): add barrel export"
```

---

### Task 10: Update Page to Use RightPanel

**Files:**
- Modify: `apps/vibedeckx-ui/app/page.tsx:9,88-94`

**Step 1: Update import**

Change line 9 from:

```typescript
import { ExecutorPanel } from '@/components/executor';
```

to:

```typescript
import { RightPanel } from '@/components/right-panel';
```

**Step 2: Update the right panel section**

Change lines 88-94 from:

```tsx
        {/* Right Panel: Executor Panel */}
        <div className="w-1/2 flex flex-col overflow-hidden">
          <ExecutorPanel
            projectId={currentProject?.id ?? null}
            selectedWorktree={selectedWorktree}
          />
        </div>
```

to:

```tsx
        {/* Right Panel: Executors + Diff */}
        <div className="w-1/2 flex flex-col overflow-hidden">
          <RightPanel
            projectId={currentProject?.id ?? null}
            selectedWorktree={selectedWorktree}
          />
        </div>
```

**Step 3: Commit**

```bash
git add apps/vibedeckx-ui/app/page.tsx
git commit -m "feat(page): replace ExecutorPanel with RightPanel"
```

---

### Task 11: Fix ExecutorPanel Header Height

**Files:**
- Modify: `apps/vibedeckx-ui/components/executor/executor-panel.tsx:42`

**Step 1: Update header to remove height conflict**

Since RightPanel now has its own tab bar, ExecutorPanel's header should not duplicate the height styling. Change line 42 from:

```tsx
      <div className="flex items-center justify-between p-4 border-b">
```

to:

```tsx
      <div className="flex items-center justify-between p-4 border-b h-14">
```

**Step 2: Commit**

```bash
git add apps/vibedeckx-ui/components/executor/executor-panel.tsx
git commit -m "fix(executor): add consistent header height"
```

---

### Task 12: Manual Testing

**Step 1: Start the dev server**

Run: `pnpm dev` (or appropriate command)

**Step 2: Verify functionality**

1. Open the app in browser
2. Select a project
3. Verify tab bar shows "Executors" and "Diff" tabs
4. Click "Diff" tab - should show diff panel
5. Make a file change in the project
6. Click "Refresh" - should show the change
7. Click "Executors" tab - should show executor panel
8. Verify both panels work correctly

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address any issues found during testing"
```
