// 检查是否是本地开发模式（Next.js dev server 在 3000 端口）
function isLocalDevMode(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  // 只有在 localhost:3000 时才是本地开发模式
  return window.location.hostname === "localhost" && window.location.port === "3000";
}

// 获取 API 基础地址
function getApiBase(): string {
  if (typeof window === "undefined") {
    return "";
  }
  // 本地开发模式：前端在 3000，后端在 5173
  if (isLocalDevMode()) {
    return "http://localhost:5173";
  }
  // 生产模式或通过 tunnel 访问：使用相对路径
  return "";
}

export function getWebSocketUrl(path: string): string {
  if (typeof window === "undefined") {
    return `ws://localhost:5173${path}`;
  }

  // 本地开发模式：连接到后端 5173 端口
  if (isLocalDevMode()) {
    return `ws://localhost:5173${path}`;
  }

  // 生产模式或通过 tunnel 访问：使用当前页面的 host
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${protocol}//${host}${path}`;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  is_remote: boolean;
  remote_url?: string;
  created_at: string;
}

export interface RemoteBrowseItem {
  name: string;
  path: string;
  type: "directory";
}

export interface RemoteBrowseResponse {
  path: string;
  items: RemoteBrowseItem[];
}

export interface DirectoryEntry {
  name: string;
  type: "file" | "directory";
}

export interface Worktree {
  path: string;
  branch: string | null;
}

export interface Executor {
  id: string;
  project_id: string;
  name: string;
  command: string;
  cwd: string | null;
  pty: boolean;
  position: number;
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

export type LogMessage =
  | { type: "stdout"; data: string }
  | { type: "stderr"; data: string }
  | { type: "pty"; data: string }
  | { type: "finished"; exitCode: number }
  | { type: "init"; isPty: boolean }
  | { type: "error"; message: string };

export type InputMessage =
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number };

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

export const api = {
  async getProjects(): Promise<Project[]> {
    const res = await fetch(`${getApiBase()}/api/projects`);
    const data = await res.json();
    return data.projects;
  },

  async getProject(id: string): Promise<Project> {
    const res = await fetch(`${getApiBase()}/api/projects/${id}`);
    const data = await res.json();
    return data.project;
  },

  async selectFolder(): Promise<{ path: string | null; cancelled: boolean }> {
    const res = await fetch(`${getApiBase()}/api/dialog/select-folder`, {
      method: "POST",
    });
    return res.json();
  },

  async createProject(name: string, path: string): Promise<Project> {
    const res = await fetch(`${getApiBase()}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, path }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error);
    }
    const data = await res.json();
    return data.project;
  },

  async deleteProject(id: string): Promise<void> {
    await fetch(`${getApiBase()}/api/projects/${id}`, {
      method: "DELETE",
    });
  },

  async getProjectFiles(id: string): Promise<DirectoryEntry[]> {
    const res = await fetch(`${getApiBase()}/api/projects/${id}/files`);
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error);
    }
    const data = await res.json();
    return data.files;
  },

  async getProjectWorktrees(id: string): Promise<Worktree[]> {
    const res = await fetch(`${getApiBase()}/api/projects/${id}/worktrees`);
    if (!res.ok) {
      return [{ path: ".", branch: null }];
    }
    const data = await res.json();
    return data.worktrees;
  },

  async createWorktree(projectId: string, branchName: string): Promise<Worktree> {
    const res = await fetch(`${getApiBase()}/api/projects/${projectId}/worktrees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branchName }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error);
    }
    const data = await res.json();
    return data.worktree;
  },

  async deleteWorktree(projectId: string, worktreePath: string): Promise<void> {
    const res = await fetch(`${getApiBase()}/api/projects/${projectId}/worktrees`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ worktreePath }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error);
    }
  },

  // Executor API
  async getExecutors(projectId: string): Promise<Executor[]> {
    const res = await fetch(`${getApiBase()}/api/projects/${projectId}/executors`);
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error);
    }
    const data = await res.json();
    return data.executors;
  },

  async createExecutor(
    projectId: string,
    opts: { name: string; command: string; cwd?: string; pty?: boolean }
  ): Promise<Executor> {
    const res = await fetch(`${getApiBase()}/api/projects/${projectId}/executors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error);
    }
    const data = await res.json();
    return data.executor;
  },

  async updateExecutor(
    id: string,
    opts: { name?: string; command?: string; cwd?: string | null; pty?: boolean }
  ): Promise<Executor> {
    const res = await fetch(`${getApiBase()}/api/executors/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error);
    }
    const data = await res.json();
    return data.executor;
  },

  async deleteExecutor(id: string): Promise<void> {
    const res = await fetch(`${getApiBase()}/api/executors/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error);
    }
  },

  async reorderExecutors(projectId: string, orderedIds: string[]): Promise<void> {
    const res = await fetch(`${getApiBase()}/api/projects/${projectId}/executors/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderedIds }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error);
    }
  },

  // Process Control API
  async startExecutor(executorId: string, worktreePath?: string): Promise<string> {
    const res = await fetch(`${getApiBase()}/api/executors/${executorId}/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ worktreePath }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error);
    }
    const data = await res.json();
    return data.processId;
  },

  async stopProcess(processId: string): Promise<void> {
    const res = await fetch(`${getApiBase()}/api/executor-processes/${processId}/stop`, {
      method: "POST",
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error);
    }
  },

  async getRunningProcesses(): Promise<ExecutorProcess[]> {
    const res = await fetch(`${getApiBase()}/api/executor-processes/running`);
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error);
    }
    const data = await res.json();
    return data.processes;
  },

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

  // Remote Project API
  async testRemoteConnection(url: string, apiKey: string): Promise<{ success: boolean; message?: string }> {
    const res = await fetch(`${getApiBase()}/api/remote/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, apiKey }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Connection failed");
    }
    return res.json();
  },

  async browseRemoteDirectory(url: string, apiKey: string, path?: string): Promise<RemoteBrowseResponse> {
    const res = await fetch(`${getApiBase()}/api/remote/browse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, apiKey, path }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to browse directory");
    }
    return res.json();
  },

  async createRemoteProject(
    name: string,
    path: string,
    remoteUrl: string,
    remoteApiKey: string
  ): Promise<Project> {
    const res = await fetch(`${getApiBase()}/api/projects/remote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, path, remoteUrl, remoteApiKey }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Failed to create remote project");
    }
    const data = await res.json();
    return data.project;
  },
};
