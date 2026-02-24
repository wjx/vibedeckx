# Workspace Interactive Terminal — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a VS Code-style interactive terminal tab to the right panel, with multi-terminal support per project.

**Architecture:** Extend ProcessManager with `startTerminal()` to spawn persistent interactive shells. Reuse existing WebSocket endpoint and xterm.js components. New REST routes for terminal CRUD. New frontend TerminalPanel component with multi-terminal switching.

**Tech Stack:** node-pty, xterm.js, Fastify routes, React hooks, WebSocket

---

### Task 1: Extend ProcessManager with terminal support

**Files:**
- Modify: `packages/vibedeckx/src/process-manager.ts`

**Step 1: Add TerminalInfo type and update RunningProcess**

Add after the `InputMessage` type (line 15):

```typescript
export interface TerminalInfo {
  id: string;
  projectId: string;
  name: string;
  cwd: string;
}
```

Add `isTerminal` and `name` to `RunningProcess` interface (line 19):

```typescript
interface RunningProcess {
  process: ChildProcess | IPty;
  isPty: boolean;
  isTerminal: boolean;
  name: string;
  logs: LogMessage[];
  subscribers: Set<LogSubscriber>;
  executorId: string;
  projectId: string;
  projectPath: string;
  skipDb: boolean;
}
```

Update all existing places that create `RunningProcess` objects (in `startPtyProcess` line 112 and `startRegularProcess` line 167) to include `isTerminal: false, name: ""`.

**Step 2: Add ring buffer for terminal logs**

Add a constant after `LOG_RETENTION_MS` (line 30):

```typescript
const TERMINAL_MAX_LOG_ENTRIES = 5000;
```

In the PTY `onData` handler (line 127-131), add ring buffer logic:

```typescript
ptyProcess.onData((data: string) => {
  const msg: LogMessage = { type: "pty", data };
  runningProcess.logs.push(msg);
  // Ring buffer for terminals: cap at TERMINAL_MAX_LOG_ENTRIES
  if (runningProcess.isTerminal && runningProcess.logs.length > TERMINAL_MAX_LOG_ENTRIES) {
    runningProcess.logs = runningProcess.logs.slice(-TERMINAL_MAX_LOG_ENTRIES);
  }
  this.broadcast(processId, msg);
});
```

**Step 3: Modify cleanup behavior for terminals**

In the PTY `onExit` handler (line 134-154), change the cleanup logic:

```typescript
ptyProcess.onExit(({ exitCode }) => {
  const code = exitCode ?? 0;
  console.log(`[ProcessManager] PTY process ${processId} exited with code ${code}`);

  if (!skipDb) {
    const status: ExecutorProcessStatus = code === 0 ? "completed" : "failed";
    this.storage.executorProcesses.updateStatus(processId, status, code);
  }

  const msg: LogMessage = { type: "finished", exitCode: code };
  runningProcess.logs.push(msg);
  this.broadcast(processId, msg);

  if (!runningProcess.isTerminal) {
    this.eventBus?.emit({ type: "executor:stopped", projectId: runningProcess.projectId, executorId: runningProcess.executorId, processId, exitCode: code });
  }

  if (runningProcess.isTerminal) {
    // Terminals: cleanup immediately on exit
    this.processes.delete(processId);
  } else {
    // Executors: retain logs for 5 minutes
    setTimeout(() => {
      console.log(`[ProcessManager] Cleaning up process ${processId}`);
      this.processes.delete(processId);
    }, LOG_RETENTION_MS);
  }
});
```

**Step 4: Add `startTerminal()` method**

Add after the existing `start()` method (after line 83):

```typescript
private terminalCounter = 0;

/**
 * Start an interactive terminal session (persistent shell, no command)
 * Returns the process ID
 */
startTerminal(projectId: string, cwd: string): { id: string; name: string } {
  const processId = crypto.randomUUID();
  this.terminalCounter++;
  const name = `Terminal ${this.terminalCounter}`;

  let shell: string;
  if (process.platform === "win32") {
    shell = "powershell.exe";
  } else {
    shell = process.env.SHELL || "/bin/zsh";
    if (shell === "bash" || shell === "zsh" || shell === "sh") {
      shell = `/bin/${shell}`;
    }
  }

  console.log(`[ProcessManager] Starting terminal ${processId} (${name}) in ${cwd}`);

  const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 80,
    rows: 24,
    cwd,
    env: { ...process.env, TERM: "xterm-256color", FORCE_COLOR: "1" } as Record<string, string>,
  });

  const runningProcess: RunningProcess = {
    process: ptyProcess,
    isPty: true,
    isTerminal: true,
    name,
    logs: [],
    subscribers: new Set(),
    executorId: "",
    projectId,
    projectPath: cwd,
    skipDb: true,
  };

  this.processes.set(processId, runningProcess);

  ptyProcess.onData((data: string) => {
    const msg: LogMessage = { type: "pty", data };
    runningProcess.logs.push(msg);
    if (runningProcess.logs.length > TERMINAL_MAX_LOG_ENTRIES) {
      runningProcess.logs = runningProcess.logs.slice(-TERMINAL_MAX_LOG_ENTRIES);
    }
    this.broadcast(processId, msg);
  });

  ptyProcess.onExit(({ exitCode }) => {
    const code = exitCode ?? 0;
    console.log(`[ProcessManager] Terminal ${processId} exited with code ${code}`);
    const msg: LogMessage = { type: "finished", exitCode: code };
    runningProcess.logs.push(msg);
    this.broadcast(processId, msg);
    this.processes.delete(processId);
  });

  return { id: processId, name };
}
```

**Step 5: Add `getTerminals()` method**

Add after `getRunningProcessIds()` (after line 353):

```typescript
/**
 * Get all running terminal sessions for a project
 */
getTerminals(projectId: string): TerminalInfo[] {
  const terminals: TerminalInfo[] = [];
  for (const [id, proc] of this.processes) {
    if (proc.isTerminal && proc.projectId === projectId) {
      const lastLog = proc.logs[proc.logs.length - 1];
      if (lastLog?.type !== "finished") {
        terminals.push({ id, projectId: proc.projectId, name: proc.name, cwd: proc.projectPath });
      }
    }
  }
  return terminals;
}
```

**Step 6: Type-check backend**

Run: `npx tsc --noEmit -p packages/vibedeckx/tsconfig.json`
Expected: no errors

**Step 7: Commit**

```bash
git add packages/vibedeckx/src/process-manager.ts
git commit -m "feat: extend ProcessManager with startTerminal() for interactive shell sessions"
```

---

### Task 2: Add terminal REST routes

**Files:**
- Create: `packages/vibedeckx/src/routes/terminal-routes.ts`
- Modify: `packages/vibedeckx/src/server.ts` (register routes)

**Step 1: Create terminal-routes.ts**

Create `packages/vibedeckx/src/routes/terminal-routes.ts`:

```typescript
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { resolveWorktreePath } from "../utils/worktree-paths.js";
import "../server-types.js";

const routes: FastifyPluginAsync = async (fastify) => {
  // List terminals for a project
  fastify.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/terminals",
    async (req, reply) => {
      const project = fastify.storage.projects.getById(req.params.projectId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }
      const terminals = fastify.processManager.getTerminals(req.params.projectId);
      return reply.code(200).send({ terminals });
    }
  );

  // Create a new terminal
  fastify.post<{
    Params: { projectId: string };
    Body: { cwd?: string; branch?: string | null };
  }>("/api/projects/:projectId/terminals", async (req, reply) => {
    const project = fastify.storage.projects.getById(req.params.projectId);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }
    if (!project.path) {
      return reply.code(400).send({ error: "Project has no local path" });
    }

    const branch = req.body?.branch;
    const basePath = resolveWorktreePath(project.path, branch ?? null);
    const cwd = req.body?.cwd || basePath;

    try {
      const terminal = fastify.processManager.startTerminal(req.params.projectId, cwd);
      return reply.code(201).send({ terminal: { ...terminal, cwd } });
    } catch (error) {
      return reply.code(500).send({ error: String(error) });
    }
  });

  // Close a terminal
  fastify.delete<{ Params: { terminalId: string } }>(
    "/api/terminals/:terminalId",
    async (req, reply) => {
      const stopped = fastify.processManager.stop(req.params.terminalId);
      if (!stopped) {
        return reply.code(404).send({ error: "Terminal not found or already closed" });
      }
      return reply.code(200).send({ success: true });
    }
  );
};

export default fp(routes, { name: "terminal-routes" });
```

**Step 2: Register routes in server.ts**

Add import at line 19 (after `import eventRoutes`):

```typescript
import terminalRoutes from "./routes/terminal-routes.js";
```

Add registration at line 94 (after `server.register(eventRoutes);`):

```typescript
server.register(terminalRoutes);
```

**Step 3: Type-check backend**

Run: `npx tsc --noEmit -p packages/vibedeckx/tsconfig.json`
Expected: no errors

**Step 4: Commit**

```bash
git add packages/vibedeckx/src/routes/terminal-routes.ts packages/vibedeckx/src/server.ts
git commit -m "feat: add REST routes for terminal CRUD"
```

---

### Task 3: Add frontend API methods and types

**Files:**
- Modify: `apps/vibedeckx-ui/lib/api.ts`

**Step 1: Add TerminalSession interface**

Add after the `ExecutorProcess` interface (around line 141):

```typescript
export interface TerminalSession {
  id: string;
  projectId: string;
  name: string;
  cwd: string;
}
```

**Step 2: Add terminal API methods**

Add to the `api` object (before the closing `};` at line 768):

```typescript
  // Terminal API
  async getTerminals(projectId: string): Promise<TerminalSession[]> {
    const res = await fetch(`${getApiBase()}/api/projects/${projectId}/terminals`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.terminals;
  },

  async createTerminal(projectId: string, branch?: string | null): Promise<TerminalSession> {
    const res = await fetch(`${getApiBase()}/api/projects/${projectId}/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error);
    }
    const data = await res.json();
    return data.terminal;
  },

  async closeTerminal(terminalId: string): Promise<void> {
    await fetch(`${getApiBase()}/api/terminals/${terminalId}`, {
      method: "DELETE",
    });
  },
```

**Step 3: Type-check frontend**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`
Expected: no errors

**Step 4: Commit**

```bash
git add apps/vibedeckx-ui/lib/api.ts
git commit -m "feat: add terminal API methods and TerminalSession type"
```

---

### Task 4: Create useTerminals hook

**Files:**
- Create: `apps/vibedeckx-ui/hooks/use-terminals.ts`

**Step 1: Create the hook**

Create `apps/vibedeckx-ui/hooks/use-terminals.ts`:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { api, type TerminalSession } from "@/lib/api";

export interface UseTerminalsResult {
  terminals: TerminalSession[];
  activeTerminalId: string | null;
  createTerminal: () => Promise<void>;
  closeTerminal: (id: string) => Promise<void>;
  setActiveTerminal: (id: string) => void;
  removeTerminal: (id: string) => void;
}

export function useTerminals(
  projectId: string | null,
  branch?: string | null
): UseTerminalsResult {
  const [terminals, setTerminals] = useState<TerminalSession[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);

  // Fetch existing terminals when projectId changes
  useEffect(() => {
    if (!projectId) {
      setTerminals([]);
      setActiveTerminalId(null);
      return;
    }

    api.getTerminals(projectId).then((list) => {
      setTerminals(list);
      if (list.length > 0 && !activeTerminalId) {
        setActiveTerminalId(list[0].id);
      }
    });
  }, [projectId]);

  const createTerminal = useCallback(async () => {
    if (!projectId) return;
    const terminal = await api.createTerminal(projectId, branch);
    setTerminals((prev) => [...prev, terminal]);
    setActiveTerminalId(terminal.id);
  }, [projectId, branch]);

  const closeTerminal = useCallback(async (id: string) => {
    await api.closeTerminal(id);
    setTerminals((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeTerminalId === id) {
        setActiveTerminalId(next.length > 0 ? next[next.length - 1].id : null);
      }
      return next;
    });
  }, [activeTerminalId]);

  const setActiveTerminal = useCallback((id: string) => {
    setActiveTerminalId(id);
  }, []);

  // Remove a terminal from the list (called when shell exits on its own)
  const removeTerminal = useCallback((id: string) => {
    setTerminals((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeTerminalId === id) {
        setActiveTerminalId(next.length > 0 ? next[next.length - 1].id : null);
      }
      return next;
    });
  }, [activeTerminalId]);

  return {
    terminals,
    activeTerminalId,
    createTerminal,
    closeTerminal,
    setActiveTerminal,
    removeTerminal,
  };
}
```

**Step 2: Type-check frontend**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add apps/vibedeckx-ui/hooks/use-terminals.ts
git commit -m "feat: add useTerminals hook for terminal session management"
```

---

### Task 5: Create TerminalPanel component

**Files:**
- Create: `apps/vibedeckx-ui/components/terminal/terminal-panel.tsx`
- Create: `apps/vibedeckx-ui/components/terminal/index.ts`

**Step 1: Create the TerminalPanel component**

Create `apps/vibedeckx-ui/components/terminal/terminal-panel.tsx`:

```typescript
"use client";

import { useCallback } from "react";
import { Plus, X, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ExecutorOutput } from "@/components/executor/executor-output";
import { useTerminals } from "@/hooks/use-terminals";
import { useExecutorLogs } from "@/hooks/use-executor-logs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

interface TerminalPanelProps {
  projectId: string | null;
  selectedBranch?: string | null;
}

function TerminalInstance({
  terminalId,
  onExit,
}: {
  terminalId: string;
  onExit: (id: string) => void;
}) {
  const { logs, isPty, sendInput, sendResize, exitCode } = useExecutorLogs(terminalId);

  // When shell exits, notify parent
  if (exitCode !== null) {
    // Use setTimeout to avoid setState during render
    setTimeout(() => onExit(terminalId), 0);
  }

  return (
    <ExecutorOutput
      logs={logs}
      isPty={isPty || true}
      className="h-full rounded-none border-0"
      onInput={sendInput}
      onResize={sendResize}
    />
  );
}

export function TerminalPanel({ projectId, selectedBranch }: TerminalPanelProps) {
  const {
    terminals,
    activeTerminalId,
    createTerminal,
    closeTerminal,
    setActiveTerminal,
    removeTerminal,
  } = useTerminals(projectId, selectedBranch);

  const handleExit = useCallback(
    (id: string) => {
      removeTerminal(id);
    },
    [removeTerminal]
  );

  if (!projectId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Select a project to use the terminal
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center h-10 border-b px-2 gap-1 shrink-0">
        <ScrollArea className="flex-1">
          <div className="flex items-center gap-1">
            {terminals.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTerminal(t.id)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs whitespace-nowrap transition-colors",
                  activeTerminalId === t.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                <Terminal className="h-3 w-3" />
                {t.name}
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTerminal(t.id);
                  }}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </span>
              </button>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={createTerminal}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Terminal content */}
      <div className="flex-1 overflow-hidden bg-zinc-950">
        {activeTerminalId ? (
          <TerminalInstance
            key={activeTerminalId}
            terminalId={activeTerminalId}
            onExit={handleExit}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3">
            <Terminal className="h-8 w-8" />
            <p className="text-sm">No terminal open</p>
            <Button variant="outline" size="sm" onClick={createTerminal}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New Terminal
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Create index.ts barrel export**

Create `apps/vibedeckx-ui/components/terminal/index.ts`:

```typescript
export { TerminalPanel } from "./terminal-panel";
```

**Step 3: Type-check frontend**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`
Expected: no errors

**Step 4: Commit**

```bash
git add apps/vibedeckx-ui/components/terminal/
git commit -m "feat: add TerminalPanel component with multi-terminal support"
```

---

### Task 6: Wire TerminalPanel into RightPanel

**Files:**
- Modify: `apps/vibedeckx-ui/components/right-panel/right-panel.tsx`

**Step 1: Add Terminal tab and import**

Update `right-panel.tsx` to add the Terminal tab:

1. Add import: `import { TerminalPanel } from '@/components/terminal';`
2. Change `TabType` to: `type TabType = 'executors' | 'diff' | 'terminal';`
3. Add the Terminal tab button after the Diff button (same style pattern)
4. Add the `TerminalPanel` in the content area

The final component should look like:

```typescript
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Terminal, GitBranch, SquareTerminal } from 'lucide-react';
import { ExecutorPanel } from '@/components/executor';
import { DiffPanel } from '@/components/diff';
import { TerminalPanel } from '@/components/terminal';
import type { Project, ExecutionMode } from '@/lib/api';

interface RightPanelProps {
  projectId: string | null;
  selectedBranch?: string | null;
  onMergeRequest?: () => void;
  project?: Project | null;
  onExecutorModeChange?: (mode: ExecutionMode) => void;
}

type TabType = 'executors' | 'diff' | 'terminal';

export function RightPanel({ projectId, selectedBranch, onMergeRequest, project, onExecutorModeChange }: RightPanelProps) {
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
        <button
          onClick={() => setActiveTab('terminal')}
          className={cn(
            'flex items-center gap-2 px-4 border-b-2 transition-colors',
            activeTab === 'terminal'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <SquareTerminal className="h-4 w-4" />
          Terminal
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'executors' ? (
          <ExecutorPanel
            projectId={projectId}
            selectedBranch={selectedBranch}
            project={project}
            onExecutorModeChange={onExecutorModeChange}
          />
        ) : activeTab === 'diff' ? (
          <DiffPanel
            projectId={projectId}
            selectedBranch={selectedBranch}
            onMergeRequest={onMergeRequest}
            project={project}
          />
        ) : (
          <TerminalPanel
            projectId={projectId}
            selectedBranch={selectedBranch}
          />
        )}
      </div>
    </div>
  );
}
```

**Step 2: Type-check frontend**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add apps/vibedeckx-ui/components/right-panel/right-panel.tsx
git commit -m "feat: add Terminal tab to RightPanel"
```

---

### Task 7: Manual verification

**Step 1: Start development servers**

Run: `pnpm dev:all`

**Step 2: Verify terminal tab appears**

Open browser at `http://localhost:3000`, select a project. The right panel should show three tabs: Executors, Diff, Terminal.

**Step 3: Test terminal creation**

Click Terminal tab → click [+] or "New Terminal" button → an interactive shell should appear with a prompt.

**Step 4: Test terminal interaction**

Type `ls` and press Enter → should see file listing. Type `pwd` → should show project directory.

**Step 5: Test multiple terminals**

Click [+] again → second terminal appears → both tabs visible → clicking between them switches the view.

**Step 6: Test terminal close**

Click [×] on a terminal tab → terminal should be removed, process killed.

**Step 7: Test workspace switching**

Switch to a different branch/project → switch back → terminals should reconnect and show previous output.

**Step 8: Test shell exit**

Type `exit` in terminal → terminal should auto-remove from the list.

**Step 9: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: terminal integration adjustments"
```
