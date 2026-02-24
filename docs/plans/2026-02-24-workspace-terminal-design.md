# Workspace Interactive Terminal

## Overview

Add a VS Code-style interactive terminal to each workspace. Users can create multiple terminal sessions per project, switch between them, and terminals persist in the background when navigating away.

## Approach: Extend ProcessManager (Option A)

Reuse the existing PTY/WebSocket/xterm infrastructure. Add a `startTerminal()` method to ProcessManager that spawns an interactive shell (no predefined command). Terminal processes differ from executor processes in lifecycle: no DB tracking, no 5-minute cleanup, ring buffer for log retention.

## Backend Changes

### ProcessManager Extensions

- `startTerminal(projectId: string, cwd: string): string` — spawns `pty.spawn(shell, [], { cwd })` with no command args
- `getTerminals(projectId: string): TerminalInfo[]` — lists running terminals for a project
- `RunningProcess` gains `isTerminal: boolean` — terminals skip the 5-minute LOG_RETENTION_MS cleanup
- Terminal logs use a ring buffer capped at **5000 entries** instead of unbounded array
- On terminal exit: immediate cleanup from Map (no retention period)

### New Routes: `terminal-routes.ts`

```
POST   /api/projects/:projectId/terminals     { cwd?, branch? } → { id, name, cwd }
GET    /api/projects/:projectId/terminals      → TerminalInfo[]
DELETE /api/terminals/:terminalId              → kill process
```

### WebSocket: Reuse Existing

Terminal processIds use the same endpoint: `/api/executor-processes/:processId/logs`. No new WebSocket route needed.

### Shared Services Plugin

Register nothing new — ProcessManager already available via `fastify.processManager`.

## Frontend Changes

### RightPanel Tab Bar

```
Before:  [Executors] [Diff]
After:   [Executors] [Diff] [Terminal]
```

`TabType = 'executors' | 'diff' | 'terminal'`

### New Component: TerminalPanel

```
TerminalPanel (h-full flex flex-col)
├── Header (h-14, border-b)
│   ├── Terminal selector (horizontal tabs or dropdown)
│   ├── [+] Create terminal button
│   └── [×] Close current terminal button
├── Terminal Content (flex-1)
│   └── TerminalOutput (reuse existing xterm.js component)
```

### New Hook: useTerminals(projectId, branch)

```typescript
interface TerminalSession { id: string; name: string; cwd: string; }

interface UseTerminalsResult {
  terminals: TerminalSession[];
  activeTerminalId: string | null;
  createTerminal: () => Promise<string>;
  closeTerminal: (id: string) => Promise<void>;
  setActiveTerminal: (id: string) => void;
}
```

### Reused Components

- `TerminalOutput` — xterm.js rendering with PTY input/output/resize
- `useExecutorLogs` — WebSocket connection (pass terminalId as processId)

## Lifecycle

- **Navigate away**: WebSocket disconnects, xterm destroyed, shell process keeps running
- **Navigate back**: Fetch terminal list, reconnect WebSocket, replay buffered output
- **User closes terminal**: DELETE API call, kill process
- **User types `exit`**: PTY onExit fires, frontend receives `finished`, auto-remove from list
- **Server restart**: All terminal processes lost (acceptable)

## YAGNI — Not Implementing

- Terminal rename
- Terminal split/panes
- DB persistence for terminal sessions
- Remote terminal proxy
- Terminal in executor panel
