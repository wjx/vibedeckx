import fastify from "fastify";
import { fastifyStatic } from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { mkdir, writeFile, readFile, stat, readdir } from "fs/promises";
import type { Storage } from "./storage/types.js";
import { selectFolder } from "./dialog.js";
import { ProcessManager, type LogMessage, type InputMessage } from "./process-manager.js";

export const createServer = (opts: { storage: Storage }) => {
  const UI_ROOT = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "./ui"
  );

  const server = fastify();
  const processManager = new ProcessManager(opts.storage);

  // CORS - 必须在所有路由之前设置
  server.addHook("onRequest", (req, reply, done) => {
    reply.header("access-control-allow-origin", "*");
    reply.header("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS");
    reply.header("access-control-allow-headers", "Content-Type, Upgrade, Connection");
    done();
  });

  // Handle CORS preflight requests
  server.options("/*", async (req, reply) => {
    return reply.code(204).send();
  });

  // 注册 WebSocket 插件
  server.register(fastifyWebsocket);

  // 在 WebSocket 插件注册完成后定义 WebSocket 路由
  server.after(() => {
    server.get<{ Params: { processId: string } }>(
      "/api/executor-processes/:processId/logs",
      { websocket: true },
      (socket, req) => {
        const { processId } = req.params;

        console.log(`[WebSocket] Client connected for process ${processId}`);

        // Send PTY mode info first
        const isPty = processManager.isPtyProcess(processId);
        socket.send(JSON.stringify({ type: "init", isPty }));

        // 发送历史日志
        const logs = processManager.getLogs(processId);
        console.log(`[WebSocket] Sending ${logs.length} historical logs`);
        for (const log of logs) {
          socket.send(JSON.stringify(log));
        }

        const isRunning = processManager.isRunning(processId);
        console.log(`[WebSocket] Process running: ${isRunning}`);

        // 如果进程已结束且日志为空，发送错误
        if (logs.length === 0 && !isRunning) {
          console.log(`[WebSocket] Process not found or no logs, closing connection`);
          socket.send(JSON.stringify({ type: "error", message: "Process not found" }));
          socket.close();
          return;
        }

        // 检查是否已经结束
        const lastLog = logs[logs.length - 1];
        if (lastLog?.type === "finished") {
          socket.close();
          return;
        }

        // 订阅新日志
        const unsubscribe = processManager.subscribe(processId, (msg: LogMessage) => {
          try {
            socket.send(JSON.stringify(msg));
            if (msg.type === "finished") {
              socket.close();
            }
          } catch (error) {
            // Socket might be closed
            unsubscribe?.();
          }
        });

        // Handle incoming messages (input, resize) for PTY processes
        socket.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
          try {
            const message = JSON.parse(data.toString()) as InputMessage;
            if (message.type === "input" || message.type === "resize") {
              processManager.handleInput(processId, message);
            }
          } catch (error) {
            console.error("[WebSocket] Failed to parse input message:", error);
          }
        });

        // 处理连接关闭
        socket.on("close", () => {
          unsubscribe?.();
        });
      }
    );
  });

  // 提供静态 UI 文件（排除 /api 路径）
  server.register(fastifyStatic, {
    root: UI_ROOT,
    wildcard: false, // 禁止通配符，避免拦截 API 路由
  });

  // SPA 路由支持 - 只对非 API 路径返回 index.html
  server.setNotFoundHandler(async (req, reply) => {
    if (req.url.startsWith("/api/")) {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.status(200).sendFile("index.html");
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

  // 获取项目目录文件列表
  server.get<{ Params: { id: string } }>("/api/projects/:id/files", async (req, reply) => {
    const project = opts.storage.projects.getById(req.params.id);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    try {
      const entries = await readdir(project.path, { withFileTypes: true });
      const files = entries
        .filter((entry) => !entry.name.startsWith("."))
        .map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? "directory" : "file" as const,
        }))
        .sort((a, b) => {
          // Directories first, then alphabetically
          if (a.type !== b.type) {
            return a.type === "directory" ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

      return reply.code(200).send({ files });
    } catch (error) {
      return reply.code(500).send({ error: "Failed to read directory" });
    }
  });

  // ==================== Executor API ====================

  // 获取项目的所有 Executor
  server.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/executors",
    async (req, reply) => {
      const project = opts.storage.projects.getById(req.params.projectId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const executors = opts.storage.executors.getByProjectId(req.params.projectId);
      return reply.code(200).send({ executors });
    }
  );

  // 创建 Executor
  server.post<{
    Params: { projectId: string };
    Body: { name: string; command: string; cwd?: string; pty?: boolean };
  }>("/api/projects/:projectId/executors", async (req, reply) => {
    const project = opts.storage.projects.getById(req.params.projectId);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    const { name, command, cwd, pty } = req.body;
    const id = randomUUID();
    const executor = opts.storage.executors.create({
      id,
      project_id: req.params.projectId,
      name,
      command,
      cwd,
      pty,
    });

    return reply.code(201).send({ executor });
  });

  // 更新 Executor
  server.put<{
    Params: { id: string };
    Body: { name?: string; command?: string; cwd?: string | null; pty?: boolean };
  }>("/api/executors/:id", async (req, reply) => {
    const existing = opts.storage.executors.getById(req.params.id);
    if (!existing) {
      return reply.code(404).send({ error: "Executor not found" });
    }

    const executor = opts.storage.executors.update(req.params.id, req.body);
    return reply.code(200).send({ executor });
  });

  // 删除 Executor
  server.delete<{ Params: { id: string } }>("/api/executors/:id", async (req, reply) => {
    const existing = opts.storage.executors.getById(req.params.id);
    if (!existing) {
      return reply.code(404).send({ error: "Executor not found" });
    }

    opts.storage.executors.delete(req.params.id);
    return reply.code(200).send({ success: true });
  });

  // ==================== Process Control API ====================

  // 启动 Executor
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

  // 停止进程
  server.post<{ Params: { processId: string } }>(
    "/api/executor-processes/:processId/stop",
    async (req, reply) => {
      console.log(`[API] Stop process requested: ${req.params.processId}`);
      const stopped = processManager.stop(req.params.processId);
      console.log(`[API] Stop result: ${stopped}`);
      if (!stopped) {
        return reply.code(404).send({ error: "Process not found or already stopped" });
      }
      return reply.code(200).send({ success: true });
    }
  );

  // 获取所有运行中的进程
  server.get("/api/executor-processes/running", async (req, reply) => {
    const runningProcessIds = processManager.getRunningProcessIds();
    const processes = runningProcessIds.map((id) => {
      const dbProcess = opts.storage.executorProcesses.getById(id);
      return dbProcess;
    }).filter(Boolean);

    return reply.code(200).send({ processes });
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
