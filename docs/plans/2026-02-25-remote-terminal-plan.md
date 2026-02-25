# Remote Terminal Support — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable terminal creation on remote servers for projects with both local and remote configurations.

**Architecture:** Mirror the executor remote proxy pattern. The local server proxies terminal requests to the remote server, stores a mapping in `remoteExecutorMap` with `remote-terminal-` prefixed IDs, and the existing WebSocket proxy handles bidirectional PTY streaming.

**Tech Stack:** Fastify (backend), React/Next.js (frontend), node-pty (remote terminal spawning), WebSocket (PTY streaming)

---

### Task 1: Add `POST /api/path/terminals` endpoint (remote server side)

**Files:**
- Modify: `packages/vibedeckx/src/routes/terminal-routes.ts:6-56`

**Step 1: Add the path-based terminal endpoint**

Add this new route inside the `routes` function, before the existing routes:

```typescript
// Create terminal at a path (for remote execution)
fastify.post<{
  Body: { path: string; branch?: string | null };
}>("/api/path/terminals", async (req, reply) => {
  const { path: projectPath, branch } = req.body;
  if (!projectPath) {
    return reply.code(400).send({ error: "Path is required" });
  }

  const resolvedPath = resolveWorktreePath(projectPath, branch ?? null);

  try {
    const terminal = fastify.processManager.startTerminal("remote", resolvedPath);
    return reply.code(201).send({ terminal: { ...terminal, cwd: resolvedPath } });
  } catch (error) {
    return reply.code(500).send({ error: String(error) });
  }
});
```

**Step 2: Verify with type check**

Run: `npx tsc --noEmit -p packages/vibedeckx/tsconfig.json`
Expected: PASS (no errors)

**Step 3: Commit**

```bash
git add packages/vibedeckx/src/routes/terminal-routes.ts
git commit -m "feat: add POST /api/path/terminals for remote terminal creation"
```

---

### Task 2: Add remote proxy to `POST /api/projects/:projectId/terminals`

**Files:**
- Modify: `packages/vibedeckx/src/routes/terminal-routes.ts:1-5` (add import)
- Modify: `packages/vibedeckx/src/routes/terminal-routes.ts:20-43` (the create endpoint)

**Step 1: Add the import for `proxyToRemote`**

At the top of `terminal-routes.ts`, add:

```typescript
import { proxyToRemote } from "../utils/remote-proxy.js";
```

**Step 2: Update the Body type and add remote logic**

Replace the existing `POST /api/projects/:projectId/terminals` handler with:

```typescript
// Create a new terminal
fastify.post<{
  Params: { projectId: string };
  Body: { cwd?: string; branch?: string | null; location?: "local" | "remote" };
}>("/api/projects/:projectId/terminals", async (req, reply) => {
  const project = fastify.storage.projects.getById(req.params.projectId);
  if (!project) {
    return reply.code(404).send({ error: "Project not found" });
  }

  const requestedLocation = req.body?.location;
  const branch = req.body?.branch;

  // Determine whether to use remote, mirroring executor logic
  const useRemote = requestedLocation === "remote" ||
    (!requestedLocation && project.remote_url && project.remote_api_key && project.remote_path &&
      (!project.path || project.executor_mode === "remote"));

  if (useRemote) {
    if (!project.remote_url || !project.remote_api_key || !project.remote_path) {
      return reply.code(400).send({ error: "Project has no remote configuration" });
    }

    const result = await proxyToRemote(
      project.remote_url,
      project.remote_api_key,
      "POST",
      "/api/path/terminals",
      { path: project.remote_path, branch: branch ?? undefined }
    );

    if (result.ok) {
      const remoteData = result.data as { terminal: { id: string; name: string; cwd: string } };
      const localId = `remote-terminal-${remoteData.terminal.id}`;
      fastify.remoteExecutorMap.set(localId, {
        remoteUrl: project.remote_url,
        remoteApiKey: project.remote_api_key,
        remoteProcessId: remoteData.terminal.id,
      });
      return reply.code(201).send({
        terminal: {
          id: localId,
          projectId: req.params.projectId,
          name: remoteData.terminal.name,
          cwd: remoteData.terminal.cwd,
          location: "remote" as const,
        },
      });
    }
    return reply.code(result.status || 502).send(result.data);
  }

  // Local terminal creation (existing logic)
  if (!project.path) {
    return reply.code(400).send({ error: "Project has no local path" });
  }

  const basePath = resolveWorktreePath(project.path, branch ?? null);
  const cwd = req.body?.cwd || basePath;

  try {
    const terminal = fastify.processManager.startTerminal(req.params.projectId, cwd);
    return reply.code(201).send({ terminal: { ...terminal, cwd, location: "local" as const } });
  } catch (error) {
    return reply.code(500).send({ error: String(error) });
  }
});
```

**Step 3: Verify with type check**

Run: `npx tsc --noEmit -p packages/vibedeckx/tsconfig.json`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/vibedeckx/src/routes/terminal-routes.ts
git commit -m "feat: add remote proxy support to terminal creation endpoint"
```

---

### Task 3: Add remote proxy to `GET` and `DELETE` terminal routes

**Files:**
- Modify: `packages/vibedeckx/src/routes/terminal-routes.ts` (GET and DELETE handlers)

**Step 1: Update GET to merge remote terminals**

Replace the existing GET handler:

```typescript
// List terminals for a project
fastify.get<{ Params: { projectId: string } }>(
  "/api/projects/:projectId/terminals",
  async (req, reply) => {
    const project = fastify.storage.projects.getById(req.params.projectId);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    // Local terminals
    const localTerminals = fastify.processManager.getTerminals(req.params.projectId).map((t) => ({
      ...t,
      location: "local" as const,
    }));

    // Also include any remote terminals tracked in remoteExecutorMap
    const remoteTerminals: Array<{ id: string; projectId: string; name: string; cwd: string; location: "remote" }> = [];
    for (const [localId, info] of fastify.remoteExecutorMap.entries()) {
      if (localId.startsWith("remote-terminal-")) {
        remoteTerminals.push({
          id: localId,
          projectId: req.params.projectId,
          name: `Terminal (remote)`,
          cwd: info.remoteProcessId,
          location: "remote",
        });
      }
    }

    return reply.code(200).send({ terminals: [...localTerminals, ...remoteTerminals] });
  }
);
```

Note: The `remoteExecutorMap` doesn't store terminal metadata (name, cwd). For listing, we use a generic name. The real terminal name is returned at creation time and stored in frontend state — the GET is mainly for reconnecting on page reload. Since terminals are ephemeral and have no DB persistence, this is acceptable.

**Step 2: Update DELETE to handle remote terminals**

Replace the existing DELETE handler:

```typescript
// Close a terminal
fastify.delete<{ Params: { terminalId: string } }>(
  "/api/terminals/:terminalId",
  async (req, reply) => {
    const { terminalId } = req.params;

    if (terminalId.startsWith("remote-terminal-")) {
      const remoteInfo = fastify.remoteExecutorMap.get(terminalId);
      if (!remoteInfo) {
        return reply.code(404).send({ error: "Remote terminal not found" });
      }
      const result = await proxyToRemote(
        remoteInfo.remoteUrl,
        remoteInfo.remoteApiKey,
        "POST",
        `/api/executor-processes/${remoteInfo.remoteProcessId}/stop`
      );
      fastify.remoteExecutorMap.delete(terminalId);
      return reply.code(result.status || 200).send(result.data);
    }

    const stopped = fastify.processManager.stop(terminalId);
    if (!stopped) {
      return reply.code(404).send({ error: "Terminal not found or already closed" });
    }
    return reply.code(200).send({ success: true });
  }
);
```

**Step 3: Verify with type check**

Run: `npx tsc --noEmit -p packages/vibedeckx/tsconfig.json`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/vibedeckx/src/routes/terminal-routes.ts
git commit -m "feat: add remote support to terminal list and delete endpoints"
```

---

### Task 4: Update frontend API and types

**Files:**
- Modify: `apps/vibedeckx-ui/lib/api.ts:143-148` (TerminalSession interface)
- Modify: `apps/vibedeckx-ui/lib/api.ts:784-796` (createTerminal method)

**Step 1: Add `location` field to `TerminalSession` interface**

In `api.ts`, update the interface:

```typescript
export interface TerminalSession {
  id: string;
  projectId: string;
  name: string;
  cwd: string;
  location?: "local" | "remote";
}
```

**Step 2: Update `createTerminal` to accept `location` parameter**

```typescript
async createTerminal(projectId: string, branch?: string | null, location?: "local" | "remote"): Promise<TerminalSession> {
  const res = await fetch(`${getApiBase()}/api/projects/${projectId}/terminals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch, location }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error);
  }
  const data = await res.json();
  return data.terminal;
},
```

**Step 3: Verify with type check**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/vibedeckx-ui/lib/api.ts
git commit -m "feat: add location param to terminal API types and createTerminal"
```

---

### Task 5: Update `useTerminals` hook

**Files:**
- Modify: `apps/vibedeckx-ui/hooks/use-terminals.ts`

**Step 1: Update `createTerminal` to accept `location`**

Update the hook interface and implementation:

```typescript
export interface UseTerminalsResult {
  terminals: TerminalSession[];
  activeTerminalId: string | null;
  createTerminal: (location?: "local" | "remote") => Promise<void>;
  closeTerminal: (id: string) => Promise<void>;
  setActiveTerminal: (id: string) => void;
  removeTerminal: (id: string) => void;
}
```

Update the `createTerminal` callback:

```typescript
const createTerminal = useCallback(async (location?: "local" | "remote") => {
  if (!projectId) return;
  const terminal = await api.createTerminal(projectId, branch, location);
  setTerminals((prev) => [...prev, terminal]);
  setActiveTerminalId(terminal.id);
}, [projectId, branch]);
```

**Step 2: Verify with type check**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add apps/vibedeckx-ui/hooks/use-terminals.ts
git commit -m "feat: add location parameter to useTerminals createTerminal"
```

---

### Task 6: Update `RightPanel` to pass `project` to `TerminalPanel`

**Files:**
- Modify: `apps/vibedeckx-ui/components/right-panel/right-panel.tsx:82-87`

**Step 1: Pass `project` prop to `TerminalPanel`**

Change the terminal tab rendering from:

```tsx
<TerminalPanel
  projectId={projectId}
  selectedBranch={selectedBranch}
/>
```

To:

```tsx
<TerminalPanel
  projectId={projectId}
  selectedBranch={selectedBranch}
  project={project}
/>
```

**Step 2: Verify with type check**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`
Expected: may fail until Task 7 updates `TerminalPanelProps` — that's expected

**Step 3: Commit** (combine with Task 7)

---

### Task 7: Update `TerminalPanel` with location-aware "+" button

**Files:**
- Modify: `apps/vibedeckx-ui/components/terminal/terminal-panel.tsx`

**Step 1: Add `project` prop and location-aware UI**

Update the full component. Key changes:
- Add `Project` type import and `project` prop
- Detect `hasBothPaths` (project has both `path` and `remote_url`)
- Replace the "+" button with a split button when `hasBothPaths`:
  - Main button: creates at default location (follows `executor_mode`)
  - Small dropdown arrow: shows menu with "Local" and "Remote" options
- Show Cloud icon on remote terminal tabs, Monitor icon on local tabs (only when `hasBothPaths`)

```tsx
"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import { Plus, X, Terminal, Monitor, Cloud, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ExecutorOutput } from "@/components/executor/executor-output";
import { useTerminals } from "@/hooks/use-terminals";
import { useExecutorLogs } from "@/hooks/use-executor-logs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type { Project } from "@/lib/api";

interface TerminalPanelProps {
  projectId: string | null;
  selectedBranch?: string | null;
  project?: Project | null;
}

function TerminalInstance({
  terminalId,
  onExit,
}: {
  terminalId: string;
  onExit: (id: string) => void;
}) {
  const { logs, sendInput, sendResize, exitCode } = useExecutorLogs(terminalId);

  useEffect(() => {
    if (exitCode !== null) {
      onExit(terminalId);
    }
  }, [exitCode, onExit, terminalId]);

  return (
    <ExecutorOutput
      logs={logs}
      isPty={true}
      className="h-full rounded-none border-0"
      onInput={sendInput}
      onResize={sendResize}
    />
  );
}

export function TerminalPanel({ projectId, selectedBranch, project }: TerminalPanelProps) {
  const {
    terminals,
    activeTerminalId,
    createTerminal,
    closeTerminal,
    setActiveTerminal,
    removeTerminal,
  } = useTerminals(projectId, selectedBranch);

  const [showLocationMenu, setShowLocationMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasBothPaths = !!(project?.path && project?.remote_url);
  const defaultLocation = hasBothPaths && project?.executor_mode === "remote" ? "remote" : "local";

  const handleCreateDefault = useCallback(() => {
    createTerminal(hasBothPaths ? defaultLocation : undefined);
  }, [createTerminal, hasBothPaths, defaultLocation]);

  const handleCreateAt = useCallback((location: "local" | "remote") => {
    setShowLocationMenu(false);
    createTerminal(location);
  }, [createTerminal]);

  const handleExit = useCallback(
    (id: string) => {
      removeTerminal(id);
    },
    [removeTerminal]
  );

  // Close dropdown on outside click
  useEffect(() => {
    if (!showLocationMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowLocationMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showLocationMenu]);

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
                {hasBothPaths ? (
                  t.location === "remote" || t.id.startsWith("remote-") ? (
                    <Cloud className="h-3 w-3" />
                  ) : (
                    <Monitor className="h-3 w-3" />
                  )
                ) : (
                  <Terminal className="h-3 w-3" />
                )}
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

        {/* New terminal button — split button when both paths available */}
        {hasBothPaths ? (
          <div className="relative shrink-0" ref={menuRef}>
            <div className="inline-flex items-center">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-r-none"
                onClick={handleCreateDefault}
                title={`New ${defaultLocation} terminal`}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-4 rounded-l-none border-l border-border/50"
                onClick={() => setShowLocationMenu((v) => !v)}
              >
                <ChevronDown className="h-2.5 w-2.5" />
              </Button>
            </div>
            {showLocationMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-popover border rounded-md shadow-md py-1 min-w-[140px]">
                <button
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                  onClick={() => handleCreateAt("local")}
                >
                  <Monitor className="h-3 w-3" />
                  Local Terminal
                </button>
                <button
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                  onClick={() => handleCreateAt("remote")}
                >
                  <Cloud className="h-3 w-3" />
                  Remote Terminal
                </button>
              </div>
            )}
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={handleCreateDefault}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        )}
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
            <Button variant="outline" size="sm" onClick={handleCreateDefault}>
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

**Step 2: Verify with type check**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit** (together with Task 6)

```bash
git add apps/vibedeckx-ui/components/right-panel/right-panel.tsx apps/vibedeckx-ui/components/terminal/terminal-panel.tsx
git commit -m "feat: add location-aware terminal creation UI with split button"
```

---

### Task 8: Verify end-to-end and type-check both packages

**Step 1: Backend type check**

Run: `npx tsc --noEmit -p packages/vibedeckx/tsconfig.json`
Expected: PASS

**Step 2: Frontend type check**

Run: `cd apps/vibedeckx-ui && npx tsc --noEmit`
Expected: PASS

**Step 3: Frontend lint**

Run: `pnpm --filter vibedeckx-ui lint`
Expected: PASS (fix any issues)

**Step 4: Build**

Run: `pnpm build`
Expected: PASS
