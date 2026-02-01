export interface Project {
  id: string;
  name: string;
  path: string;
  created_at: string;
}

export interface Executor {
  id: string;
  project_id: string;
  name: string;
  command: string;
  cwd: string | null;
  pty: boolean;
  created_at: string;
}

export type ExecutorProcessStatus = 'running' | 'completed' | 'failed' | 'killed';

export interface ExecutorProcess {
  id: string;
  executor_id: string;
  status: ExecutorProcessStatus;
  exit_code: number | null;
  started_at: string;
  finished_at: string | null;
}

export type AgentSessionStatus = 'running' | 'stopped' | 'error';

export interface AgentSession {
  id: string;
  project_id: string;
  worktree_path: string;
  status: AgentSessionStatus;
  created_at: string;
}

export interface Storage {
  projects: {
    create: (opts: { id: string; name: string; path: string }) => Project;
    getAll: () => Project[];
    getById: (id: string) => Project | undefined;
    getByPath: (path: string) => Project | undefined;
    delete: (id: string) => void;
  };
  executors: {
    create: (opts: { id: string; project_id: string; name: string; command: string; cwd?: string; pty?: boolean }) => Executor;
    getByProjectId: (projectId: string) => Executor[];
    getById: (id: string) => Executor | undefined;
    update: (id: string, opts: { name?: string; command?: string; cwd?: string | null; pty?: boolean }) => Executor | undefined;
    delete: (id: string) => void;
  };
  executorProcesses: {
    create: (opts: { id: string; executor_id: string }) => ExecutorProcess;
    getById: (id: string) => ExecutorProcess | undefined;
    getRunning: () => ExecutorProcess[];
    updateStatus: (id: string, status: ExecutorProcessStatus, exitCode?: number) => void;
  };
  agentSessions: {
    create: (opts: { id: string; project_id: string; worktree_path: string }) => AgentSession;
    getById: (id: string) => AgentSession | undefined;
    getByProjectId: (projectId: string) => AgentSession[];
    getByWorktree: (projectId: string, worktreePath: string) => AgentSession | undefined;
    updateStatus: (id: string, status: AgentSessionStatus) => void;
    delete: (id: string) => void;
  };
  close: () => void;
}
