# Vibedeckx 项目管理功能实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 vibedeckx 添加项目创建和管理功能，支持选择本地目录作为工作空间，并将其改造为可通过 npx 安装的包。

**Architecture:** 将现有的 Next.js 应用改造为 monorepo 结构，包含主包（CLI + 后端）和 UI 应用。后端使用 Fastify 提供 API，SQLite 存储项目数据。CLI 启动时运行 Fastify 服务器并提供前端静态文件。

**Tech Stack:** TypeScript, Fastify, better-sqlite3, @stricli/core (CLI), React, Next.js (仅用于开发，生产构建为静态文件)

---

## Task 1: 创建 Monorepo 结构

**Files:**
- Create: `packages/vibedeckx/package.json`
- Create: `packages/vibedeckx/tsconfig.json`
- Create: `packages/vibedeckx/src/index.ts`
- Create: `apps/vibedeckx-ui/` (移动现有前端代码)
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json` (根目录)

**Step 1: 创建根目录 pnpm-workspace.yaml**

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

**Step 2: 创建根目录 package.json**

```json
{
  "name": "vibedeckx-monorepo",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter vibedeckx-ui dev",
    "build": "pnpm build:main && pnpm build:ui",
    "build:main": "pnpm --filter vibedeckx build",
    "build:ui": "pnpm --filter vibedeckx-ui build && cp -r apps/vibedeckx-ui/out packages/vibedeckx/dist/ui"
  },
  "devDependencies": {
    "typescript": "^5"
  }
}
```

**Step 3: 创建 packages/vibedeckx/package.json**

```json
{
  "name": "vibedeckx",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "vibedeckx": "./dist/bin.js"
  },
  "files": ["./dist/*"],
  "scripts": {
    "build": "tsc && chmod +x ./dist/bin.js",
    "dev": "tsc -w"
  },
  "dependencies": {
    "@fastify/static": "^8.2.0",
    "@stricli/core": "^1.2.0",
    "better-sqlite3": "^11.6.0",
    "fastify": "^5.6.1",
    "open": "^10.1.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^20"
  }
}
```

**Step 4: 创建 packages/vibedeckx/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

**Step 5: 移动现有前端代码到 apps/vibedeckx-ui/**

将现有的 vibedeckx 目录内容移动到 apps/vibedeckx-ui/

**Step 6: 安装依赖**

Run: `cd /src/vibedeckx-dev/vibedeckx && pnpm install`

**Step 7: Commit**

```bash
git add .
git commit -m "chore: restructure as monorepo with packages and apps"
```

---

## Task 2: 实现 SQLite 存储层

**Files:**
- Create: `packages/vibedeckx/src/storage/sqlite.ts`
- Create: `packages/vibedeckx/src/storage/types.ts`
- Create: `packages/vibedeckx/src/constants.ts`

**Step 1: 创建类型定义**

Create `packages/vibedeckx/src/storage/types.ts`:

```typescript
export interface Project {
  id: string;
  name: string;
  path: string;
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
  close: () => void;
}
```

**Step 2: 创建常量文件**

Create `packages/vibedeckx/src/constants.ts`:

```typescript
import { homedir } from "os";
import path from "path";

export const VIBEDECKX_HOME = path.join(homedir(), ".vibedeckx");
export const DB_PATH = path.join(VIBEDECKX_HOME, "data.sqlite");
export const DEFAULT_PORT = 3000;
```

**Step 3: 实现 SQLite 存储**

Create `packages/vibedeckx/src/storage/sqlite.ts`:

```typescript
import Database from "better-sqlite3";
import type { BetterSqlite3Database } from "better-sqlite3";
import { mkdir } from "fs/promises";
import path from "path";
import type { Project, Storage } from "./types.js";

const createDatabase = (dbPath: string): BetterSqlite3Database => {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return db;
};

export const createSqliteStorage = async (dbPath: string): Promise<Storage> => {
  await mkdir(path.dirname(dbPath), { recursive: true });
  const db = createDatabase(dbPath);

  return {
    projects: {
      create: ({ id, name, path: projectPath }) => {
        db.prepare(
          `INSERT INTO projects (id, name, path) VALUES (@id, @name, @path)`
        ).run({ id, name, path: projectPath });

        return db
          .prepare<{ id: string }, Project>(`SELECT * FROM projects WHERE id = @id`)
          .get({ id })!;
      },

      getAll: () => {
        return db
          .prepare<{}, Project>(`SELECT * FROM projects ORDER BY created_at DESC`)
          .all({});
      },

      getById: (id: string) => {
        return db
          .prepare<{ id: string }, Project>(`SELECT * FROM projects WHERE id = @id`)
          .get({ id });
      },

      getByPath: (projectPath: string) => {
        return db
          .prepare<{ path: string }, Project>(`SELECT * FROM projects WHERE path = @path`)
          .get({ path: projectPath });
      },

      delete: (id: string) => {
        db.prepare(`DELETE FROM projects WHERE id = @id`).run({ id });
      },
    },

    close: () => {
      db.close();
    },
  };
};
```

**Step 4: Commit**

```bash
git add packages/vibedeckx/src/storage packages/vibedeckx/src/constants.ts
git commit -m "feat: add SQLite storage layer for project management"
```

---

## Task 3: 实现目录选择对话框

**Files:**
- Create: `packages/vibedeckx/src/dialog.ts`

**Step 1: 实现跨平台目录选择**

Create `packages/vibedeckx/src/dialog.ts`:

```typescript
import { exec } from "child_process";
import { promisify } from "util";
import { platform } from "os";

const execAsync = promisify(exec);

export const selectFolder = async (): Promise<string | null> => {
  const os = platform();

  try {
    if (os === "darwin") {
      // macOS: 使用 osascript
      const { stdout } = await execAsync(
        `osascript -e 'set folderPath to POSIX path of (choose folder with prompt "Select a project folder")' -e 'return folderPath'`
      );
      const path = stdout.trim();
      return path || null;
    } else if (os === "win32") {
      // Windows: 使用 PowerShell
      const { stdout } = await execAsync(
        `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.ShowDialog() | Out-Null; $f.SelectedPath"`
      );
      const path = stdout.trim();
      return path || null;
    } else {
      // Linux: 尝试 zenity，然后 kdialog
      try {
        const { stdout } = await execAsync(
          `zenity --file-selection --directory --title="Select a project folder"`
        );
        return stdout.trim() || null;
      } catch {
        try {
          const { stdout } = await execAsync(
            `kdialog --getexistingdirectory ~`
          );
          return stdout.trim() || null;
        } catch {
          throw new Error("No file dialog available. Please install zenity or kdialog.");
        }
      }
    }
  } catch (error) {
    // 用户取消选择
    return null;
  }
};
```

**Step 2: Commit**

```bash
git add packages/vibedeckx/src/dialog.ts
git commit -m "feat: add cross-platform folder selection dialog"
```

---

## Task 4: 实现 Fastify 服务器

**Files:**
- Create: `packages/vibedeckx/src/server.ts`

**Step 1: 实现服务器**

Create `packages/vibedeckx/src/server.ts`:

```typescript
import fastify from "fastify";
import { fastifyStatic } from "@fastify/static";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { mkdir, writeFile, readFile, stat } from "fs/promises";
import type { Storage } from "./storage/types.js";
import { selectFolder } from "./dialog.js";

export const createServer = (opts: { storage: Storage }) => {
  const UI_ROOT = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "./ui"
  );

  const server = fastify();

  // 提供静态 UI 文件
  server.register(fastifyStatic, {
    root: UI_ROOT,
  });

  // SPA 路由支持
  server.setNotFoundHandler(async (req, reply) => {
    return reply.status(200).sendFile("index.html");
  });

  // CORS
  server.addHook("onSend", (req, reply, payload, done) => {
    reply.header("access-control-allow-origin", "*");
    reply.header("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
    reply.header("access-control-allow-headers", "Content-Type");
    done(null, payload);
  });

  // 获取所有项目
  server.get("/api/projects", async (req, reply) => {
    const projects = opts.storage.projects.getAll();
    return reply.code(200).send({ projects });
  });

  // 获取单个项目
  server.get<{ Params: { id: string } }>("/api/projects/:id", async (req, reply) => {
    const project = opts.storage.projects.getById(req.params.id);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }
    return reply.code(200).send({ project });
  });

  // 打开目录选择对话框
  server.post("/api/dialog/select-folder", async (req, reply) => {
    const folderPath = await selectFolder();
    if (!folderPath) {
      return reply.code(200).send({ path: null, cancelled: true });
    }
    return reply.code(200).send({ path: folderPath, cancelled: false });
  });

  // 创建项目
  server.post<{
    Body: { name: string; path: string };
  }>("/api/projects", async (req, reply) => {
    const { name, path: projectPath } = req.body;

    // 检查路径是否已存在
    const existing = opts.storage.projects.getByPath(projectPath);
    if (existing) {
      return reply.code(409).send({ error: "Project with this path already exists" });
    }

    // 创建 .vibedeckx 目录
    const vibedeckxDir = path.join(projectPath, ".vibedeckx");
    await mkdir(vibedeckxDir, { recursive: true });

    // 创建配置文件
    const configPath = path.join(vibedeckxDir, "config.json");
    const config = {
      name,
      created_at: new Date().toISOString(),
    };
    await writeFile(configPath, JSON.stringify(config, null, 2));

    // 保存到数据库
    const id = randomUUID();
    const project = opts.storage.projects.create({ id, name, path: projectPath });

    return reply.code(201).send({ project });
  });

  // 删除项目
  server.delete<{ Params: { id: string } }>("/api/projects/:id", async (req, reply) => {
    const project = opts.storage.projects.getById(req.params.id);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    opts.storage.projects.delete(req.params.id);
    return reply.code(200).send({ success: true });
  });

  return {
    start: async (port: number) => {
      await server.listen({ port, host: "0.0.0.0" });
      return `http://localhost:${port}`;
    },
    close: async () => {
      await server.close();
    },
  };
};
```

**Step 2: Commit**

```bash
git add packages/vibedeckx/src/server.ts
git commit -m "feat: add Fastify server with project management API"
```

---

## Task 5: 实现 CLI

**Files:**
- Create: `packages/vibedeckx/src/bin.ts`
- Create: `packages/vibedeckx/src/command.ts`

**Step 1: 创建命令定义**

Create `packages/vibedeckx/src/command.ts`:

```typescript
import { buildApplication, buildCommand, buildRouteMap } from "@stricli/core";
import { createSqliteStorage } from "./storage/sqlite.js";
import { createServer } from "./server.js";
import { DB_PATH, DEFAULT_PORT } from "./constants.js";
import open from "open";

const startCommand = buildCommand({
  parameters: {
    flags: {
      port: {
        kind: "parsed",
        parse: parseInt,
        brief: "Port to run the server on",
        optional: true,
      },
    },
  },
  func: async (flags: { port: number | undefined }) => {
    const port = flags.port ?? DEFAULT_PORT;

    console.log("Starting vibedeckx...");

    const storage = await createSqliteStorage(DB_PATH);
    const server = createServer({ storage });

    const url = await server.start(port);
    console.log(`Server running at ${url}`);

    // 打开浏览器
    await open(url);

    // 处理退出信号
    const cleanup = async () => {
      console.log("\nShutting down...");
      await server.close();
      storage.close();
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  },
  docs: {
    brief: "Start the vibedeckx server",
  },
});

const routes = buildRouteMap({
  routes: {
    start: startCommand,
  },
  defaultCommand: "start",
  docs: {
    brief: "Vibedeckx - AI-powered app generator",
  },
});

export const program = buildApplication(routes, {
  name: "vibedeckx",
  versionInfo: {
    currentVersion: "0.1.0",
  },
});
```

**Step 2: 创建 bin.ts**

Create `packages/vibedeckx/src/bin.ts`:

```typescript
#!/usr/bin/env node

import { run } from "@stricli/core";
import { program } from "./command.js";

run(program, process.argv.slice(2), { process });
```

**Step 3: 创建入口文件**

Create `packages/vibedeckx/src/index.ts`:

```typescript
export { createServer } from "./server.js";
export { createSqliteStorage } from "./storage/sqlite.js";
export type { Storage, Project } from "./storage/types.js";
```

**Step 4: Commit**

```bash
git add packages/vibedeckx/src/bin.ts packages/vibedeckx/src/command.ts packages/vibedeckx/src/index.ts
git commit -m "feat: add CLI with start command"
```

---

## Task 6: 修改前端 - 添加项目管理组件

**Files:**
- Create: `apps/vibedeckx-ui/components/project/project-card.tsx`
- Create: `apps/vibedeckx-ui/components/project/project-selector.tsx`
- Create: `apps/vibedeckx-ui/components/project/create-project-dialog.tsx`
- Create: `apps/vibedeckx-ui/lib/api.ts`
- Create: `apps/vibedeckx-ui/hooks/use-projects.ts`

**Step 1: 创建 API 客户端**

Create `apps/vibedeckx-ui/lib/api.ts`:

```typescript
const API_BASE = "";

export interface Project {
  id: string;
  name: string;
  path: string;
  created_at: string;
}

export const api = {
  async getProjects(): Promise<Project[]> {
    const res = await fetch(`${API_BASE}/api/projects`);
    const data = await res.json();
    return data.projects;
  },

  async getProject(id: string): Promise<Project> {
    const res = await fetch(`${API_BASE}/api/projects/${id}`);
    const data = await res.json();
    return data.project;
  },

  async selectFolder(): Promise<{ path: string | null; cancelled: boolean }> {
    const res = await fetch(`${API_BASE}/api/dialog/select-folder`, {
      method: "POST",
    });
    return res.json();
  },

  async createProject(name: string, path: string): Promise<Project> {
    const res = await fetch(`${API_BASE}/api/projects`, {
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
    await fetch(`${API_BASE}/api/projects/${id}`, {
      method: "DELETE",
    });
  },
};
```

**Step 2: 创建 useProjects hook**

Create `apps/vibedeckx-ui/hooks/use-projects.ts`:

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { api, type Project } from "@/lib/api";

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getProjects();
      setProjects(data);
      if (data.length > 0 && !currentProject) {
        setCurrentProject(data[0]);
      }
    } finally {
      setLoading(false);
    }
  }, [currentProject]);

  useEffect(() => {
    fetchProjects();
  }, []);

  const createProject = async (name: string, path: string) => {
    const project = await api.createProject(name, path);
    setProjects((prev) => [project, ...prev]);
    setCurrentProject(project);
    return project;
  };

  const deleteProject = async (id: string) => {
    await api.deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (currentProject?.id === id) {
      setCurrentProject(projects.find((p) => p.id !== id) ?? null);
    }
  };

  const selectProject = (project: Project) => {
    setCurrentProject(project);
  };

  return {
    projects,
    currentProject,
    loading,
    createProject,
    deleteProject,
    selectProject,
    refresh: fetchProjects,
  };
}
```

**Step 3: 创建 ProjectCard 组件**

Create `apps/vibedeckx-ui/components/project/project-card.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderOpen, Calendar } from "lucide-react";
import type { Project } from "@/lib/api";

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const createdDate = new Date(project.created_at).toLocaleDateString();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{project.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FolderOpen className="h-4 w-4" />
          <span className="truncate">{project.path}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>{createdDate}</span>
        </div>
      </CardContent>
    </Card>
  );
}
```

**Step 4: 创建 CreateProjectDialog 组件**

Create `apps/vibedeckx-ui/components/project/create-project-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderOpen } from "lucide-react";
import { api } from "@/lib/api";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectCreated: (name: string, path: string) => Promise<void>;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  onProjectCreated,
}: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSelectFolder = async () => {
    const result = await api.selectFolder();
    if (result.path) {
      setPath(result.path);
      // 使用目录名作为默认项目名
      if (!name) {
        const folderName = result.path.split("/").pop() || "";
        setName(folderName);
      }
    }
  };

  const handleSubmit = async () => {
    if (!name.trim() || !path.trim()) {
      setError("Please fill in all fields");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await onProjectCreated(name.trim(), path.trim());
      setName("");
      setPath("");
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Project Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Project Folder</label>
            <div className="flex gap-2">
              <Input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/path/to/project"
                className="flex-1"
              />
              <Button variant="outline" onClick={handleSelectFolder}>
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Creating..." : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 5: 创建 ProjectSelector 组件**

Create `apps/vibedeckx-ui/components/project/project-selector.tsx`:

```tsx
"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { CreateProjectDialog } from "./create-project-dialog";
import type { Project } from "@/lib/api";

interface ProjectSelectorProps {
  projects: Project[];
  currentProject: Project | null;
  onSelectProject: (project: Project) => void;
  onCreateProject: (name: string, path: string) => Promise<void>;
}

export function ProjectSelector({
  projects,
  currentProject,
  onSelectProject,
  onCreateProject,
}: ProjectSelectorProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Select
        value={currentProject?.id}
        onValueChange={(id) => {
          const project = projects.find((p) => p.id === id);
          if (project) onSelectProject(project);
        }}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Select a project" />
        </SelectTrigger>
        <SelectContent>
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {project.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" size="icon" onClick={() => setDialogOpen(true)}>
        <Plus className="h-4 w-4" />
      </Button>
      <CreateProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onProjectCreated={onCreateProject}
      />
    </div>
  );
}
```

**Step 6: Commit**

```bash
git add apps/vibedeckx-ui/components/project apps/vibedeckx-ui/lib/api.ts apps/vibedeckx-ui/hooks/use-projects.ts
git commit -m "feat: add project management components"
```

---

## Task 7: 修改主页面 - 集成项目管理

**Files:**
- Modify: `apps/vibedeckx-ui/app/page.tsx`

**Step 1: 更新 page.tsx 集成项目管理**

修改 `apps/vibedeckx-ui/app/page.tsx`，在头部添加 ProjectSelector，在主界面显示 ProjectCard：

```tsx
'use client';
import { useState } from 'react';
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input';
import { Message, MessageContent } from '@/components/ai-elements/message';
import {
  Conversation,
  ConversationContent,
} from '@/components/ai-elements/conversation';
import {
  WebPreview,
  WebPreviewNavigation,
  WebPreviewUrl,
  WebPreviewBody,
} from '@/components/ai-elements/web-preview';
import { Loader } from '@/components/ai-elements/loader';
import { Suggestions, Suggestion } from '@/components/ai-elements/suggestion';
import { ProjectSelector } from '@/components/project/project-selector';
import { ProjectCard } from '@/components/project/project-card';
import { useProjects } from '@/hooks/use-projects';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { CreateProjectDialog } from '@/components/project/create-project-dialog';

interface Chat {
  id: string;
  demo: string;
}

export default function Home() {
  const [message, setMessage] = useState('');
  const [currentChat, setCurrentChat] = useState<Chat | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<
    Array<{
      type: 'user' | 'assistant';
      content: string;
    }>
  >([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const {
    projects,
    currentProject,
    loading: projectsLoading,
    createProject,
    selectProject,
  } = useProjects();

  const handleSendMessage = async (promptMessage: PromptInputMessage) => {
    const hasText = Boolean(promptMessage.text);
    const hasAttachments = Boolean(promptMessage.files?.length);

    if (!(hasText || hasAttachments) || isLoading) return;
    const userMessage = promptMessage.text?.trim() || 'Sent with attachments';
    setMessage('');
    setIsLoading(true);
    setChatHistory((prev) => [...prev, { type: 'user', content: userMessage }]);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          chatId: currentChat?.id,
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to create chat');
      }
      const chat: Chat = await response.json();
      setCurrentChat(chat);
      setChatHistory((prev) => [
        ...prev,
        {
          type: 'assistant',
          content: 'Generated new app preview. Check the preview panel!',
        },
      ]);
    } catch (error) {
      console.error('Error:', error);
      setChatHistory((prev) => [
        ...prev,
        {
          type: 'assistant',
          content:
            'Sorry, there was an error creating your app. Please try again.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // 显示欢迎页面（无项目时）
  if (!projectsLoading && projects.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-6">
          <h1 className="text-4xl font-bold">Welcome to Vibedeckx</h1>
          <p className="text-muted-foreground">
            Create your first project to get started
          </p>
          <Button size="lg" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-5 w-5 mr-2" />
            Create Project
          </Button>
          <CreateProjectDialog
            open={createDialogOpen}
            onOpenChange={setCreateDialogOpen}
            onProjectCreated={createProject}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header with Project Selector */}
      <div className="border-b p-3 h-14 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Vibedeckx</h1>
        <ProjectSelector
          projects={projects}
          currentProject={currentProject}
          onSelectProject={selectProject}
          onCreateProject={createProject}
        />
      </div>

      <div className="flex-1 flex">
        {/* Chat Panel */}
        <div className="w-1/2 flex flex-col border-r">
          {/* Project Info */}
          {currentProject && (
            <div className="p-4 border-b">
              <ProjectCard project={currentProject} />
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatHistory.length === 0 ? (
              <div className="text-center font-semibold mt-8">
                <p className="text-3xl mt-4">What can we build together?</p>
              </div>
            ) : (
              <>
                <Conversation>
                  <ConversationContent>
                    {chatHistory.map((msg, index) => (
                      <Message from={msg.type} key={index}>
                        <MessageContent>{msg.content}</MessageContent>
                      </Message>
                    ))}
                  </ConversationContent>
                </Conversation>
                {isLoading && (
                  <Message from="assistant">
                    <MessageContent>
                      <div className="flex items-center gap-2">
                        <Loader />
                        Creating your app...
                      </div>
                    </MessageContent>
                  </Message>
                )}
              </>
            )}
          </div>
          {/* Input */}
          <div className="border-t p-4">
            {!currentChat && (
              <Suggestions>
                <Suggestion
                  onClick={() =>
                    setMessage('Create a responsive navbar with Tailwind CSS')
                  }
                  suggestion="Create a responsive navbar with Tailwind CSS"
                />
                <Suggestion
                  onClick={() => setMessage('Build a todo app with React')}
                  suggestion="Build a todo app with React"
                />
                <Suggestion
                  onClick={() =>
                    setMessage('Make a landing page for a coffee shop')
                  }
                  suggestion="Make a landing page for a coffee shop"
                />
              </Suggestions>
            )}
            <div className="flex gap-2">
              <PromptInput
                onSubmit={handleSendMessage}
                className="mt-4 w-full max-w-2xl mx-auto relative"
              >
                <PromptInputTextarea
                  onChange={(e) => setMessage(e.target.value)}
                  value={message}
                  className="pr-12 min-h-[60px]"
                />
                <PromptInputSubmit
                  className="absolute bottom-1 right-1"
                  disabled={!message}
                  status={isLoading ? 'streaming' : 'ready'}
                />
              </PromptInput>
            </div>
          </div>
        </div>
        {/* Preview Panel */}
        <div className="w-1/2 flex flex-col">
          <WebPreview>
            <WebPreviewNavigation>
              <WebPreviewUrl
                readOnly
                placeholder="Your app here..."
                value={currentChat?.demo}
              />
            </WebPreviewNavigation>
            <WebPreviewBody src={currentChat?.demo} />
          </WebPreview>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/vibedeckx-ui/app/page.tsx
git commit -m "feat: integrate project management into main page"
```

---

## Task 8: 配置 Next.js 静态导出

**Files:**
- Modify: `apps/vibedeckx-ui/next.config.ts`
- Modify: `apps/vibedeckx-ui/package.json`

**Step 1: 配置静态导出**

修改 `apps/vibedeckx-ui/next.config.ts`:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
};

export default nextConfig;
```

**Step 2: 更新 package.json 脚本**

修改 `apps/vibedeckx-ui/package.json` 添加导出脚本：

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  }
}
```

**Step 3: Commit**

```bash
git add apps/vibedeckx-ui/next.config.ts apps/vibedeckx-ui/package.json
git commit -m "feat: configure Next.js for static export"
```

---

## Task 9: 更新构建脚本和测试

**Files:**
- Modify: `package.json` (根目录)

**Step 1: 更新根目录 package.json 构建脚本**

```json
{
  "name": "vibedeckx-monorepo",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter vibedeckx-ui dev",
    "dev:server": "pnpm --filter vibedeckx dev",
    "build": "pnpm build:main && pnpm build:ui && pnpm copy:ui",
    "build:main": "pnpm --filter vibedeckx build",
    "build:ui": "pnpm --filter vibedeckx-ui build",
    "copy:ui": "cp -r apps/vibedeckx-ui/out packages/vibedeckx/dist/ui",
    "start": "node packages/vibedeckx/dist/bin.js"
  }
}
```

**Step 2: 运行构建验证**

Run: `cd /src/vibedeckx-dev/vibedeckx && pnpm build`
Expected: Build completes successfully

**Step 3: 测试 CLI**

Run: `cd /src/vibedeckx-dev/vibedeckx && node packages/vibedeckx/dist/bin.js --help`
Expected: Shows help message with available commands

**Step 4: Commit**

```bash
git add package.json
git commit -m "chore: update build scripts for monorepo"
```

---

## Task 10: 最终测试和文档

**Step 1: 完整构建测试**

Run: `cd /src/vibedeckx-dev/vibedeckx && pnpm build`

**Step 2: 启动测试**

Run: `cd /src/vibedeckx-dev/vibedeckx && pnpm start`
Expected: Server starts and opens browser

**Step 3: 功能测试**

1. 确认欢迎页面显示
2. 点击"Create Project"按钮
3. 选择目录并创建项目
4. 确认项目信息显示在页面上

**Step 4: 最终 Commit**

```bash
git add .
git commit -m "feat: complete project management feature implementation"
```
