import fastify from "fastify";
import { fastifyStatic } from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { mkdir, writeFile, readFile, readdir } from "fs/promises";
import { existsSync } from "fs";
import WebSocket from "ws";
import type { Storage } from "./storage/types.js";
import { selectFolder } from "./dialog.js";
import { ProcessManager, type LogMessage, type InputMessage } from "./process-manager.js";
import { AgentSessionManager } from "./agent-session-manager.js";
import type { AgentWsInput } from "./agent-types.js";

// Worktree config stored in .vibedeckx/worktrees.json
interface WorktreeConfig {
  worktrees: Array<{ path: string; branch: string }>;
}

async function readWorktreeConfig(projectPath: string): Promise<WorktreeConfig> {
  const configPath = path.join(projectPath, ".vibedeckx", "worktrees.json");
  try {
    const content = await readFile(configPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return { worktrees: [] };
  }
}

async function writeWorktreeConfig(projectPath: string, config: WorktreeConfig): Promise<void> {
  const configDir = path.join(projectPath, ".vibedeckx");
  const configPath = path.join(configDir, "worktrees.json");
  await mkdir(configDir, { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
}

// API Key from environment variable for remote access authentication
const API_KEY = process.env.VIBEDECKX_API_KEY;

export const createServer = (opts: { storage: Storage }) => {
  const UI_ROOT = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "./ui"
  );

  const server = fastify();
  const processManager = new ProcessManager(opts.storage);
  const agentSessionManager = new AgentSessionManager(opts.storage);

  // CORS - 必须在所有路由之前设置
  server.addHook("onRequest", (req, reply, done) => {
    reply.header("access-control-allow-origin", "*");
    reply.header("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS");
    reply.header("access-control-allow-headers", "Content-Type, Upgrade, Connection, X-Vibedeckx-Api-Key");
    done();
  });

  // API Key authentication middleware (when VIBEDECKX_API_KEY is set)
  server.addHook("onRequest", (req, reply, done) => {
    // Skip if no API key is configured
    if (!API_KEY) return done();
    // Skip non-API routes
    if (!req.url.startsWith("/api/")) return done();
    // Skip OPTIONS requests (CORS preflight)
    if (req.method === "OPTIONS") return done();

    // Check header first, then query parameter (for WebSocket connections)
    const providedKey = req.headers["x-vibedeckx-api-key"] ||
      (req.query as { apiKey?: string })?.apiKey;

    if (providedKey !== API_KEY) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
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

    // Agent Session WebSocket
    server.get<{ Params: { sessionId: string }; Querystring: { apiKey?: string } }>(
      "/api/agent-sessions/:sessionId/stream",
      { websocket: true },
      (socket, req) => {
        const { sessionId } = req.params;

        console.log(`[AgentWS] Client connected for session ${sessionId}`);

        // Check if this is a remote session (created via proxy)
        if (sessionId.startsWith("remote-")) {
          const remoteInfo = remoteSessionMap.get(sessionId);
          if (!remoteInfo) {
            console.log(`[AgentWS] Remote session ${sessionId} not found in map`);
            socket.send(JSON.stringify({ type: "error", message: "Remote session not found" }));
            socket.close();
            return;
          }

          // Create WebSocket connection to remote server
          const cleanRemoteUrl = remoteInfo.remoteUrl.replace(/\/+$/, "");
          const wsProtocol = cleanRemoteUrl.startsWith("https") ? "wss" : "ws";
          const wsUrl = cleanRemoteUrl.replace(/^https?/, wsProtocol);
          const remoteWsUrl = `${wsUrl}/api/agent-sessions/${remoteInfo.remoteSessionId}/stream?apiKey=${encodeURIComponent(remoteInfo.remoteApiKey)}`;

          console.log(`[AgentWS] Proxying to remote: ${remoteWsUrl.replace(remoteInfo.remoteApiKey, "***")}`);

          const remoteWs = new WebSocket(remoteWsUrl);

          remoteWs.on("open", () => {
            console.log(`[AgentWS] Connected to remote session ${remoteInfo.remoteSessionId}`);
          });

          // Forward messages from remote to client
          remoteWs.on("message", (data) => {
            try {
              socket.send(data.toString());
            } catch (error) {
              console.error("[AgentWS] Failed to forward message to client:", error);
            }
          });

          // Forward messages from client to remote
          socket.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
            try {
              if (remoteWs.readyState === WebSocket.OPEN) {
                remoteWs.send(data.toString());
              }
            } catch (error) {
              console.error("[AgentWS] Failed to forward message to remote:", error);
            }
          });

          // Handle remote connection close
          remoteWs.on("close", () => {
            console.log(`[AgentWS] Remote connection closed for session ${sessionId}`);
            socket.close();
          });

          // Handle remote connection error
          remoteWs.on("error", (error) => {
            console.error(`[AgentWS] Remote connection error:`, error);
            socket.send(JSON.stringify({ type: "error", message: "Remote connection error" }));
            socket.close();
          });

          // Handle client connection close
          socket.on("close", () => {
            console.log(`[AgentWS] Client disconnected from remote session ${sessionId}`);
            remoteWs.close();
          });

          return;
        }

        // Local session handling
        // Subscribe to session updates
        const unsubscribe = agentSessionManager.subscribe(sessionId, socket);

        if (!unsubscribe) {
          console.log(`[AgentWS] Session ${sessionId} not found`);
          socket.send(JSON.stringify({ type: "error", message: "Session not found" }));
          socket.close();
          return;
        }

        // Handle incoming messages from client
        socket.on("message", (data: Buffer | ArrayBuffer | Buffer[]) => {
          try {
            const message = JSON.parse(data.toString()) as AgentWsInput;
            if (message.type === "user_message") {
              agentSessionManager.sendUserMessage(sessionId, message.content);
            }
          } catch (error) {
            console.error("[AgentWS] Failed to parse message:", error);
          }
        });

        // Handle connection close
        socket.on("close", () => {
          console.log(`[AgentWS] Client disconnected from session ${sessionId}`);
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

  // Helper to remove API key from project response
  function sanitizeProject(project: typeof opts.storage.projects extends { getById: (id: string) => infer T } ? NonNullable<T> : never) {
    const { remote_api_key: _, ...safe } = project;
    return safe;
  }

  // 获取所有项目
  server.get("/api/projects", async (req, reply) => {
    const projects = opts.storage.projects.getAll().map(sanitizeProject);
    return reply.code(200).send({ projects });
  });

  // 获取单个项目
  server.get<{ Params: { id: string } }>("/api/projects/:id", async (req, reply) => {
    const project = opts.storage.projects.getById(req.params.id);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }
    return reply.code(200).send({ project: sanitizeProject(project) });
  });

  // 打开目录选择对话框
  server.post("/api/dialog/select-folder", async (req, reply) => {
    const folderPath = await selectFolder();
    if (!folderPath) {
      return reply.code(200).send({ path: null, cancelled: true });
    }
    return reply.code(200).send({ path: folderPath, cancelled: false });
  });

  // Browse directory - for remote access to list directories
  server.get<{
    Querystring: { path?: string };
  }>("/api/browse", async (req, reply) => {
    const browsePath = req.query.path || "/";

    try {
      const entries = await readdir(browsePath, { withFileTypes: true });
      const items = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({
          name: entry.name,
          path: path.join(browsePath, entry.name),
          type: "directory" as const,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return reply.code(200).send({ path: browsePath, items });
    } catch (error) {
      return reply.code(400).send({ error: "Failed to read directory" });
    }
  });

  // ==================== Path-based API (for remote execution) ====================
  // These endpoints operate on paths directly, without requiring a project to be created.
  // Used by local vibedeckx to execute operations on remote servers.

  // Get worktrees for a path
  server.get<{
    Querystring: { path: string };
  }>("/api/path/worktrees", async (req, reply) => {
    const projectPath = req.query.path;
    if (!projectPath) {
      return reply.code(400).send({ error: "Path is required" });
    }

    const config = await readWorktreeConfig(projectPath);
    const validWorktrees = config.worktrees.filter((wt) => {
      const absolutePath = path.join(projectPath, wt.path);
      return existsSync(absolutePath);
    });

    const worktrees: Array<{ path: string; branch: string | null }> = [
      { path: ".", branch: null },
    ];
    for (const wt of validWorktrees) {
      worktrees.push({ path: wt.path, branch: wt.branch });
    }

    return reply.code(200).send({ worktrees });
  });

  // Create worktree at a path
  server.post<{
    Body: { path: string; branchName: string };
  }>("/api/path/worktrees", async (req, reply) => {
    const { path: projectPath, branchName } = req.body;
    if (!projectPath || !branchName) {
      return reply.code(400).send({ error: "Path and branchName are required" });
    }

    const trimmedBranch = branchName.trim();
    if (!/^[a-zA-Z0-9]/.test(trimmedBranch) || /[^a-zA-Z0-9/_-]/.test(trimmedBranch)) {
      return reply.code(400).send({ error: "Invalid branch name format" });
    }

    try {
      const { execSync } = await import("child_process");

      try {
        execSync(`git rev-parse --verify refs/heads/${trimmedBranch}`, {
          cwd: projectPath,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });
        return reply.code(409).send({ error: `Branch '${trimmedBranch}' already exists` });
      } catch {
        // Branch doesn't exist, continue
      }

      const worktreeDirName = trimmedBranch.replace(/\//g, "-");
      const worktreeRelativePath = `.worktrees/${worktreeDirName}`;
      const worktreeAbsolutePath = path.join(projectPath, worktreeRelativePath);

      await mkdir(path.join(projectPath, ".worktrees"), { recursive: true });

      execSync(`git worktree add -b "${trimmedBranch}" "${worktreeAbsolutePath}" main`, {
        cwd: projectPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      const config = await readWorktreeConfig(projectPath);
      config.worktrees.push({ path: worktreeRelativePath, branch: trimmedBranch });
      await writeWorktreeConfig(projectPath, config);

      return reply.code(201).send({
        worktree: { path: worktreeRelativePath, branch: trimmedBranch },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return reply.code(500).send({ error: `Failed to create worktree: ${errorMessage}` });
    }
  });

  // Delete worktree at a path
  server.delete<{
    Body: { path: string; worktreePath: string };
  }>("/api/path/worktrees", async (req, reply) => {
    const { path: projectPath, worktreePath } = req.body;
    if (!projectPath || !worktreePath) {
      return reply.code(400).send({ error: "Path and worktreePath are required" });
    }

    if (worktreePath === ".") {
      return reply.code(400).send({ error: "Cannot delete main worktree" });
    }

    try {
      const { execSync } = await import("child_process");
      const worktreeAbsPath = path.resolve(projectPath, worktreePath);

      // Check for uncommitted changes
      try {
        const statusOutput = execSync("git status --porcelain", {
          cwd: worktreeAbsPath,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });
        if (statusOutput.trim() !== "") {
          return reply.code(409).send({
            error: "Worktree has uncommitted changes",
          });
        }
      } catch {
        // Continue with deletion
      }

      // Get branch name
      let branchToDelete: string | null = null;
      try {
        const worktreeListOutput = execSync("git worktree list --porcelain", {
          cwd: projectPath,
          encoding: "utf-8",
        });
        const blocks = worktreeListOutput.trim().split("\n\n");
        for (const block of blocks) {
          const lines = block.split("\n");
          let currentPath = "";
          let currentBranch: string | null = null;
          for (const line of lines) {
            if (line.startsWith("worktree ")) currentPath = line.slice(9);
            else if (line.startsWith("branch refs/heads/")) currentBranch = line.slice(18);
          }
          if (currentPath === worktreeAbsPath) {
            branchToDelete = currentBranch;
            break;
          }
        }
      } catch {
        // Continue without branch deletion
      }

      execSync(`git worktree remove "${worktreeAbsPath}"`, {
        cwd: projectPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      if (branchToDelete) {
        try {
          execSync(`git branch -d "${branchToDelete}"`, {
            cwd: projectPath,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          });
        } catch {
          // Branch deletion failed, not critical
        }
      }

      const config = await readWorktreeConfig(projectPath);
      config.worktrees = config.worktrees.filter((wt) => wt.path !== worktreePath);
      await writeWorktreeConfig(projectPath, config);

      return reply.code(200).send({ success: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return reply.code(500).send({ error: `Failed to delete worktree: ${errorMessage}` });
    }
  });

  // Get diff for a path
  server.get<{
    Querystring: { path: string; worktreePath?: string };
  }>("/api/path/diff", async (req, reply) => {
    const projectPath = req.query.path;
    if (!projectPath) {
      return reply.code(400).send({ error: "Path is required" });
    }

    const worktreePath = req.query.worktreePath;
    const cwd = worktreePath && worktreePath !== "."
      ? path.resolve(projectPath, worktreePath)
      : projectPath;

    try {
      const { execSync } = await import("child_process");
      const diffOutput = execSync("git diff HEAD --no-color", {
        cwd,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });
      const files = parseDiffOutput(diffOutput);
      return reply.code(200).send({ files });
    } catch {
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

  // Execute command at a path (for remote executor)
  server.post<{
    Body: { path: string; command: string; cwd?: string; pty?: boolean };
  }>("/api/path/execute", async (req, reply) => {
    const { path: projectPath, command, cwd, pty } = req.body;
    if (!projectPath || !command) {
      return reply.code(400).send({ error: "Path and command are required" });
    }

    // Create a temporary executor-like object for the process manager
    const tempExecutor = {
      id: randomUUID(),
      project_id: "remote",
      name: "remote-command",
      command,
      cwd: cwd ?? null,
      pty: pty !== false,
      position: 0,
      created_at: new Date().toISOString(),
    };

    try {
      // skipDb=true: temp executor doesn't exist in DB, so skip FK-dependent operations
      const processId = processManager.start(tempExecutor, projectPath, true);
      return reply.code(200).send({ processId });
    } catch (error) {
      return reply.code(500).send({ error: String(error) });
    }
  });

  // Start agent session at a path
  server.post<{
    Body: { path: string; worktreePath?: string };
  }>("/api/path/agent-sessions", async (req, reply) => {
    const { path: projectPath, worktreePath } = req.body;
    if (!projectPath) {
      return reply.code(400).send({ error: "Path is required" });
    }

    // Use path as a pseudo project ID for remote sessions
    const pseudoProjectId = `path:${projectPath}`;
    const sessionId = agentSessionManager.getOrCreateSession(
      pseudoProjectId,
      worktreePath || ".",
      projectPath,
      true // skipDb: pseudo project ID doesn't exist in projects table
    );

    const session = agentSessionManager.getSession(sessionId);
    const messages = agentSessionManager.getMessages(sessionId);

    return reply.code(200).send({
      session: {
        id: sessionId,
        projectId: pseudoProjectId,
        worktreePath: worktreePath || ".",
        status: session?.status || "running",
      },
      messages,
    });
  });

  // ==================== Remote Proxy API ====================

  // Helper function to proxy requests to remote vibedeckx server
  async function proxyToRemote(
    remoteUrl: string,
    apiKey: string,
    method: string,
    apiPath: string,
    body?: unknown
  ): Promise<{ ok: boolean; status: number; data: unknown }> {
    try {
      const baseUrl = remoteUrl.replace(/\/+$/, "");
      const response = await fetch(`${baseUrl}${apiPath}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Vibedeckx-Api-Key": apiKey,
          "User-Agent": "Vibedeckx/1.0",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await response.json();
        return { ok: response.ok, status: response.status, data };
      } else {
        const text = await response.text();
        const data = { error: `Non-JSON response (${response.status}): ${text.slice(0, 200)}` };
        return { ok: false, status: response.status, data };
      }
    } catch (error) {
      console.error("[proxyToRemote] Error:", error);
      return {
        ok: false,
        status: 0,
        data: { error: error instanceof Error ? error.message : "Connection failed" },
      };
    }
  }

  // Test connection to remote vibedeckx server
  server.post<{
    Body: { url: string; apiKey: string };
  }>("/api/remote/test-connection", async (req, reply) => {
    const { url, apiKey } = req.body;

    if (!url || !apiKey) {
      return reply.code(400).send({ error: "URL and API key are required" });
    }

    // Try to fetch projects list to verify connection
    const result = await proxyToRemote(url, apiKey, "GET", "/api/projects");

    if (result.ok) {
      return reply.code(200).send({ success: true, message: "Connection successful" });
    } else if (result.status === 401) {
      return reply.code(401).send({ error: "Invalid API key" });
    } else if (result.status === 0) {
      return reply.code(502).send({ error: "Cannot connect to remote server" });
    } else {
      return reply.code(result.status).send(result.data);
    }
  });

  // Browse remote directory
  server.post<{
    Body: { url: string; apiKey: string; path?: string };
  }>("/api/remote/browse", async (req, reply) => {
    const { url, apiKey, path: browsePath } = req.body;

    if (!url || !apiKey) {
      return reply.code(400).send({ error: "URL and API key are required" });
    }

    const queryPath = browsePath || "/";
    const result = await proxyToRemote(
      url,
      apiKey,
      "GET",
      `/api/browse?path=${encodeURIComponent(queryPath)}`
    );

    if (result.ok) {
      return reply.code(200).send(result.data);
    } else {
      return reply.code(result.status || 502).send(result.data);
    }
  });

  // Create remote project (stores connection config locally only)
  // No project is created on the remote server - it's just an execution endpoint
  server.post<{
    Body: {
      name: string;
      path: string;
      remoteUrl: string;
      remoteApiKey: string;
    };
  }>("/api/projects/remote", async (req, reply) => {
    const { name, path: projectPath, remoteUrl, remoteApiKey } = req.body;

    if (!name || !projectPath || !remoteUrl || !remoteApiKey) {
      return reply.code(400).send({ error: "All fields are required" });
    }

    // Just store locally - remote server is only for execution
    const id = randomUUID();
    const project = opts.storage.projects.create({
      id,
      name,
      remote_path: projectPath,
      remote_url: remoteUrl,
      remote_api_key: remoteApiKey,
    });

    // Don't expose API key in response
    const { remote_api_key: _, ...safeProject } = project;
    return reply.code(201).send({ project: safeProject });
  });

  // 创建项目 (unified: local, remote, or both)
  server.post<{
    Body: {
      name: string;
      path?: string;
      remotePath?: string;
      remoteUrl?: string;
      remoteApiKey?: string;
      agentMode?: 'local' | 'remote';
      executorMode?: 'local' | 'remote';
    };
  }>("/api/projects", async (req, reply) => {
    const { name, path: projectPath, remotePath, remoteUrl, remoteApiKey, agentMode, executorMode } = req.body;

    if (!name) {
      return reply.code(400).send({ error: "Project name is required" });
    }

    // At least one of local path or remote path must be provided
    if (!projectPath && !remotePath) {
      return reply.code(400).send({ error: "At least one of local path or remote path is required" });
    }

    // If remote path is provided, remote URL and API key are required
    if (remotePath && (!remoteUrl || !remoteApiKey)) {
      return reply.code(400).send({ error: "Remote URL and API key are required when remote path is provided" });
    }

    // Check if local path already exists
    if (projectPath) {
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
    }

    // 保存到数据库
    const id = randomUUID();
    const project = opts.storage.projects.create({
      id,
      name,
      path: projectPath || null,
      remote_path: remotePath,
      remote_url: remoteUrl,
      remote_api_key: remoteApiKey,
      agent_mode: agentMode,
      executor_mode: executorMode,
    });

    return reply.code(201).send({ project: sanitizeProject(project) });
  });

  // 更新项目
  server.put<{
    Params: { id: string };
    Body: {
      name?: string;
      path?: string | null;
      remotePath?: string | null;
      remoteUrl?: string | null;
      remoteApiKey?: string | null;
      agentMode?: 'local' | 'remote';
      executorMode?: 'local' | 'remote';
    };
  }>("/api/projects/:id", async (req, reply) => {
    const project = opts.storage.projects.getById(req.params.id);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    const { name, path: newPath, remotePath, remoteUrl, remoteApiKey, agentMode, executorMode } = req.body;

    // Build the effective state after update
    const effectivePath = newPath !== undefined ? newPath : project.path;
    const effectiveRemotePath = remotePath !== undefined ? remotePath : (project.remote_path ?? null);
    const effectiveRemoteUrl = remoteUrl !== undefined ? remoteUrl : (project.remote_url ?? null);
    const effectiveRemoteApiKey = remoteApiKey !== undefined ? remoteApiKey : (project.remote_api_key ?? null);

    // Must have at least one of local path or remote path
    if (!effectivePath && !effectiveRemotePath) {
      return reply.code(400).send({ error: "Project must have at least one of local path or remote path" });
    }

    // If remote path is set, remote URL and API key are required
    if (effectiveRemotePath && (!effectiveRemoteUrl || !effectiveRemoteApiKey)) {
      return reply.code(400).send({ error: "Remote URL and API key are required when remote path is provided" });
    }

    // Check path uniqueness (excluding current project)
    if (newPath && newPath !== project.path) {
      const existing = opts.storage.projects.getByPath(newPath);
      if (existing && existing.id !== req.params.id) {
        return reply.code(409).send({ error: "Another project already uses this path" });
      }

      // Create .vibedeckx directory for new local path
      const vibedeckxDir = path.join(newPath, ".vibedeckx");
      await mkdir(vibedeckxDir, { recursive: true });
      const configPath = path.join(vibedeckxDir, "config.json");
      const config = {
        name: name ?? project.name,
        created_at: new Date().toISOString(),
      };
      await writeFile(configPath, JSON.stringify(config, null, 2));
    }

    // Build update opts for storage
    const updateOpts: {
      name?: string;
      path?: string | null;
      remote_path?: string | null;
      remote_url?: string | null;
      remote_api_key?: string | null;
      agent_mode?: 'local' | 'remote';
      executor_mode?: 'local' | 'remote';
    } = {};

    if (name !== undefined) updateOpts.name = name;
    if (newPath !== undefined) updateOpts.path = newPath;
    if (remotePath !== undefined) updateOpts.remote_path = remotePath;
    if (remoteUrl !== undefined) updateOpts.remote_url = remoteUrl;
    if (remoteApiKey !== undefined) updateOpts.remote_api_key = remoteApiKey;
    if (agentMode !== undefined) updateOpts.agent_mode = agentMode;
    if (executorMode !== undefined) updateOpts.executor_mode = executorMode;

    const updated = opts.storage.projects.update(req.params.id, updateOpts);
    if (!updated) {
      return reply.code(404).send({ error: "Project not found" });
    }

    return reply.code(200).send({ project: sanitizeProject(updated) });
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

    if (!project.path) {
      return reply.code(400).send({ error: "Project has no local path" });
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

  // 获取项目的 worktrees (从 .vibedeckx/worktrees.json 读取)
  server.get<{ Params: { id: string } }>("/api/projects/:id/worktrees", async (req, reply) => {
    const project = opts.storage.projects.getById(req.params.id);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    // Proxy to remote if this is a remote-only project (no local path)
    if (!project.path && project.remote_url && project.remote_api_key && project.remote_path) {
      const result = await proxyToRemote(
        project.remote_url,
        project.remote_api_key,
        "GET",
        `/api/path/worktrees?path=${encodeURIComponent(project.remote_path)}`
      );
      return reply.code(result.status || 200).send(result.data);
    }

    if (!project.path) {
      return reply.code(400).send({ error: "Project has no local path" });
    }

    const projectPath = project.path;

    // Read worktrees from .vibedeckx/worktrees.json
    const config = await readWorktreeConfig(projectPath);

    // Filter out worktrees whose directories no longer exist
    const validWorktrees = config.worktrees.filter((wt) => {
      const absolutePath = path.join(projectPath, wt.path);
      return existsSync(absolutePath);
    });

    // Always include the main worktree "."
    const worktrees: Array<{ path: string; branch: string | null }> = [
      { path: ".", branch: null },
    ];

    for (const wt of validWorktrees) {
      worktrees.push({ path: wt.path, branch: wt.branch });
    }

    return reply.code(200).send({ worktrees });
  });

  // 删除 git worktree
  server.delete<{
    Params: { id: string };
    Body: { worktreePath: string };
  }>("/api/projects/:id/worktrees", async (req, reply) => {
    const project = opts.storage.projects.getById(req.params.id);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    const { worktreePath } = req.body;

    // Validate worktree path
    if (!worktreePath || typeof worktreePath !== "string" || worktreePath.trim() === "") {
      return reply.code(400).send({ error: "Worktree path is required" });
    }

    // Cannot delete main worktree
    if (worktreePath === ".") {
      return reply.code(400).send({ error: "Cannot delete main worktree" });
    }

    // Proxy to remote if this is a remote-only project (no local path)
    if (!project.path && project.remote_url && project.remote_api_key && project.remote_path) {
      const result = await proxyToRemote(
        project.remote_url,
        project.remote_api_key,
        "DELETE",
        `/api/path/worktrees`,
        { path: project.remote_path, worktreePath }
      );
      return reply.code(result.status || 200).send(result.data);
    }

    if (!project.path) {
      return reply.code(400).send({ error: "Project has no local path" });
    }

    try {
      const { execSync } = await import("child_process");

      // Get absolute path of the worktree
      const worktreeAbsPath = path.resolve(project.path, worktreePath);

      // Check for uncommitted changes in the worktree
      try {
        const statusOutput = execSync("git status --porcelain", {
          cwd: worktreeAbsPath,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });

        if (statusOutput.trim() !== "") {
          return reply.code(409).send({
            error: "Worktree has uncommitted changes. Please commit or discard changes before deleting.",
          });
        }
      } catch (statusError) {
        // If git status fails, the worktree might be in a bad state
        // Continue with deletion attempt
      }

      // Get the branch name associated with this worktree before removing it
      let branchToDelete: string | null = null;
      try {
        const worktreeListOutput = execSync("git worktree list --porcelain", {
          cwd: project.path,
          encoding: "utf-8",
        });

        const blocks = worktreeListOutput.trim().split("\n\n");
        for (const block of blocks) {
          const lines = block.split("\n");
          let currentWorktreePath = "";
          let currentBranch: string | null = null;

          for (const line of lines) {
            if (line.startsWith("worktree ")) {
              currentWorktreePath = line.slice(9);
            } else if (line.startsWith("branch refs/heads/")) {
              currentBranch = line.slice(18);
            }
          }

          if (currentWorktreePath === worktreeAbsPath) {
            branchToDelete = currentBranch;
            break;
          }
        }
      } catch {
        // Failed to get branch info, continue without deleting branch
      }

      // Remove the worktree
      execSync(`git worktree remove "${worktreeAbsPath}"`, {
        cwd: project.path,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Delete the associated branch if found
      if (branchToDelete) {
        try {
          execSync(`git branch -d "${branchToDelete}"`, {
            cwd: project.path,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          });
        } catch {
          // Branch deletion failed (might have unmerged changes)
          // This is not critical, the worktree is already removed
        }
      }

      // Remove from .vibedeckx/worktrees.json
      const config = await readWorktreeConfig(project.path);
      config.worktrees = config.worktrees.filter((wt) => wt.path !== worktreePath);
      await writeWorktreeConfig(project.path, config);

      return reply.code(200).send({ success: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return reply.code(500).send({ error: `Failed to delete worktree: ${errorMessage}` });
    }
  });

  // 创建新的 git worktree
  server.post<{
    Params: { id: string };
    Body: { branchName: string };
  }>("/api/projects/:id/worktrees", async (req, reply) => {
    const project = opts.storage.projects.getById(req.params.id);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    const { branchName } = req.body;

    // Validate branch name
    if (!branchName || typeof branchName !== "string" || branchName.trim() === "") {
      return reply.code(400).send({ error: "Branch name is required" });
    }

    // Basic branch name validation (no spaces, no special chars at start/end)
    const trimmedBranch = branchName.trim();
    if (!/^[a-zA-Z0-9]/.test(trimmedBranch) || /[^a-zA-Z0-9/_-]/.test(trimmedBranch)) {
      return reply.code(400).send({ error: "Invalid branch name format" });
    }

    // Proxy to remote if this is a remote-only project (no local path)
    if (!project.path && project.remote_url && project.remote_api_key && project.remote_path) {
      const result = await proxyToRemote(
        project.remote_url,
        project.remote_api_key,
        "POST",
        `/api/path/worktrees`,
        { path: project.remote_path, branchName: trimmedBranch }
      );
      return reply.code(result.status || 201).send(result.data);
    }

    if (!project.path) {
      return reply.code(400).send({ error: "Project has no local path" });
    }

    try {
      const { execSync } = await import("child_process");

      // Check if branch already exists
      try {
        execSync(`git rev-parse --verify refs/heads/${trimmedBranch}`, {
          cwd: project.path,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });
        // If we get here, branch exists
        return reply.code(409).send({ error: `Branch '${trimmedBranch}' already exists` });
      } catch {
        // Branch doesn't exist, which is what we want
      }

      // Generate worktree path: .worktrees/<branch-with-slashes-replaced>
      const worktreeDirName = trimmedBranch.replace(/\//g, "-");
      const worktreeRelativePath = `.worktrees/${worktreeDirName}`;
      const worktreeAbsolutePath = path.join(project.path, worktreeRelativePath);

      // Create .worktrees directory if it doesn't exist
      await mkdir(path.join(project.path, ".worktrees"), { recursive: true });

      // Create the worktree with a new branch based on main
      execSync(`git worktree add -b "${trimmedBranch}" "${worktreeAbsolutePath}" main`, {
        cwd: project.path,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Use absolute paths for gitdir files (some Git versions don't handle relative paths correctly)
      // The worktree list API will auto-repair paths after project sync if needed
      const gitdirFile = path.join(project.path, ".git", "worktrees", worktreeDirName, "gitdir");
      const worktreeDotGit = path.join(worktreeAbsolutePath, ".git");
      await writeFile(gitdirFile, worktreeDotGit + "\n");

      // worktree/.git can use relative path (this works reliably across Git versions)
      const gitWorktreeMetaDir = path.join(project.path, ".git", "worktrees", worktreeDirName);
      const relativeToMain = path.relative(worktreeAbsolutePath, gitWorktreeMetaDir);
      await writeFile(worktreeDotGit, "gitdir: " + relativeToMain + "\n");

      // Save worktree info to .vibedeckx/worktrees.json for portable sync
      const config = await readWorktreeConfig(project.path);
      config.worktrees.push({ path: worktreeRelativePath, branch: trimmedBranch });
      await writeWorktreeConfig(project.path, config);

      return reply.code(201).send({
        worktree: {
          path: worktreeRelativePath,
          branch: trimmedBranch,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return reply.code(500).send({ error: `Failed to create worktree: ${errorMessage}` });
    }
  });

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

    // Proxy to remote if this is a remote-only project (no local path)
    if (!project.path && project.remote_url && project.remote_api_key && project.remote_path) {
      const params = [`path=${encodeURIComponent(project.remote_path)}`];
      if (worktreePath) params.push(`worktreePath=${encodeURIComponent(worktreePath)}`);
      const result = await proxyToRemote(
        project.remote_url,
        project.remote_api_key,
        "GET",
        `/api/path/diff?${params.join("&")}`
      );
      return reply.code(result.status || 200).send(result.data);
    }

    if (!project.path) {
      return reply.code(400).send({ error: "Project has no local path" });
    }

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

  // ==================== Executor API ====================

  // 获取项目的所有 Executor
  // Executors are always stored locally (even for remote projects)
  // Only execution is proxied to remote
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

  // 创建 Executor (stored locally even for remote projects)
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

  // Reorder Executors
  server.put<{
    Params: { projectId: string };
    Body: { orderedIds: string[] };
  }>("/api/projects/:projectId/executors/reorder", async (req, reply) => {
    const project = opts.storage.projects.getById(req.params.projectId);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return reply.code(400).send({ error: "orderedIds must be an array" });
    }

    // Validate all IDs belong to this project
    const existingExecutors = opts.storage.executors.getByProjectId(req.params.projectId);
    const existingIds = new Set(existingExecutors.map(e => e.id));
    for (const id of orderedIds) {
      if (!existingIds.has(id)) {
        return reply.code(400).send({ error: `Executor ${id} not found in project` });
      }
    }

    opts.storage.executors.reorder(req.params.projectId, orderedIds);
    return reply.code(200).send({ success: true });
  });

  // ==================== Process Control API ====================

  // 启动 Executor
  server.post<{ Params: { id: string }; Body: { worktreePath?: string } }>("/api/executors/:id/start", async (req, reply) => {
    const executor = opts.storage.executors.getById(req.params.id);
    if (!executor) {
      return reply.code(404).send({ error: "Executor not found" });
    }

    const project = opts.storage.projects.getById(executor.project_id);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    // Resolve worktree path
    const worktreePath = req.body?.worktreePath;
    const relativeCwd = worktreePath && worktreePath !== "."
      ? path.join(worktreePath, executor.cwd || "")
      : executor.cwd || "";

    // Determine if we should execute remotely:
    // - Remote-only projects (no local path): always remote
    // - Hybrid projects (both paths): check executor_mode setting
    const useRemoteExecutor = project.remote_url && project.remote_api_key && project.remote_path &&
      (!project.path || project.executor_mode === 'remote');

    if (useRemoteExecutor) {
      const result = await proxyToRemote(
        project.remote_url!,
        project.remote_api_key!,
        "POST",
        `/api/path/execute`,
        {
          path: project.remote_path,
          command: executor.command,
          cwd: relativeCwd || undefined,
          pty: executor.pty,
        }
      );
      return reply.code(result.status || 200).send(result.data);
    }

    if (!project.path) {
      return reply.code(400).send({ error: "Project has no local path" });
    }

    // Local execution
    const basePath = worktreePath && worktreePath !== "."
      ? path.resolve(project.path, worktreePath)
      : project.path;

    try {
      const processId = processManager.start(executor, basePath);
      return reply.code(200).send({ processId });
    } catch (error) {
      console.error("[API] Failed to start executor:", error);
      return reply.code(500).send({ error: String(error) });
    }
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

  // ==================== Agent Session API ====================

  // Map to track remote session IDs: localSessionId -> { remoteUrl, remoteApiKey, remoteSessionId }
  const remoteSessionMap = new Map<string, { remoteUrl: string; remoteApiKey: string; remoteSessionId: string }>();

  // 获取项目的所有 Agent Sessions
  server.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/agent-sessions",
    async (req, reply) => {
      const project = opts.storage.projects.getById(req.params.projectId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      // For remote-only projects, agent sessions run on remote server
      // But we don't have a way to list all sessions by path on remote
      // So for now, return empty list for remote-only (sessions are created on-demand)
      if (!project.path) {
        return reply.code(200).send({ sessions: [] });
      }

      const sessions = opts.storage.agentSessions.getByProjectId(req.params.projectId);
      return reply.code(200).send({ sessions });
    }
  );

  // 创建或获取 Agent Session（每个 worktree 最多一个）
  server.post<{
    Params: { projectId: string };
    Body: { worktreePath: string };
  }>("/api/projects/:projectId/agent-sessions", async (req, reply) => {
    const project = opts.storage.projects.getById(req.params.projectId);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    const { worktreePath } = req.body;

    // Determine if we should run agent remotely:
    // - Remote-only projects (no local path): always remote
    // - Hybrid projects (both paths): check agent_mode setting
    const useRemoteAgent = project.remote_url && project.remote_api_key && project.remote_path &&
      (!project.path || project.agent_mode === 'remote');

    console.log(`[API] POST agent-sessions: projectId=${req.params.projectId}, ` +
      `path=${project.path}, remote_url=${project.remote_url}, ` +
      `remote_path=${project.remote_path}, agent_mode=${project.agent_mode}, ` +
      `useRemoteAgent=${useRemoteAgent}`);

    if (useRemoteAgent) {
      try {
        const result = await proxyToRemote(
          project.remote_url!,
          project.remote_api_key!,
          "POST",
          `/api/path/agent-sessions`,
          { path: project.remote_path, worktreePath }
        );

        console.log(`[API] Remote proxy result: ok=${result.ok}, status=${result.status}, ` +
          `data=${JSON.stringify(result.data).substring(0, 500)}`);

        if (result.ok) {
          const remoteData = result.data as { session: { id: string }; messages: unknown[] };
          // Store mapping for WebSocket proxy
          const localSessionId = `remote-${project.id}-${remoteData.session.id}`;
          remoteSessionMap.set(localSessionId, {
            remoteUrl: project.remote_url!,
            remoteApiKey: project.remote_api_key!,
            remoteSessionId: remoteData.session.id,
          });

          // Return with local session ID that encodes the remote info
          return reply.code(200).send({
            session: {
              ...remoteData.session,
              id: localSessionId,
              projectId: req.params.projectId,
            },
            messages: remoteData.messages,
          });
        }
        return reply.code(result.status || 502).send(result.data);
      } catch (error) {
        console.error("[API] Remote agent session proxy error:", error);
        return reply.code(502).send({ error: `Remote agent error: ${String(error)}` });
      }
    }

    if (!project.path) {
      return reply.code(400).send({ error: "Project has no local path" });
    }

    console.log(`[API] Creating LOCAL agent session: projectId=${req.params.projectId}, worktreePath=${worktreePath || "."}, path=${project.path}`);

    try {
      const sessionId = agentSessionManager.getOrCreateSession(
        req.params.projectId,
        worktreePath || ".",
        project.path
      );

      const session = agentSessionManager.getSession(sessionId);
      const messages = agentSessionManager.getMessages(sessionId);

      return reply.code(200).send({
        session: {
          id: sessionId,
          projectId: req.params.projectId,
          worktreePath: worktreePath || ".",
          status: session?.status || "running",
        },
        messages,
      });
    } catch (error) {
      console.error("[API] Failed to create agent session:", error);
      return reply.code(500).send({ error: String(error) });
    }
  });

  // 获取 Agent Session 详情和消息历史
  server.get<{ Params: { sessionId: string } }>(
    "/api/agent-sessions/:sessionId",
    async (req, reply) => {
      const session = agentSessionManager.getSession(req.params.sessionId);
      if (!session) {
        return reply.code(404).send({ error: "Session not found" });
      }

      const messages = agentSessionManager.getMessages(req.params.sessionId);

      return reply.code(200).send({
        session: {
          id: session.id,
          projectId: session.projectId,
          worktreePath: session.worktreePath,
          status: session.status,
        },
        messages,
      });
    }
  );

  // 发送消息到 Agent Session
  server.post<{
    Params: { sessionId: string };
    Body: { content: string };
  }>("/api/agent-sessions/:sessionId/message", async (req, reply) => {
    const { content } = req.body;

    if (!content || typeof content !== "string") {
      return reply.code(400).send({ error: "Content is required" });
    }

    const success = agentSessionManager.sendUserMessage(req.params.sessionId, content);
    if (!success) {
      return reply.code(404).send({ error: "Session not found or not running" });
    }

    return reply.code(200).send({ success: true });
  });

  // 停止 Agent Session
  server.post<{ Params: { sessionId: string } }>(
    "/api/agent-sessions/:sessionId/stop",
    async (req, reply) => {
      const stopped = agentSessionManager.stopSession(req.params.sessionId);
      if (!stopped) {
        return reply.code(404).send({ error: "Session not found" });
      }
      return reply.code(200).send({ success: true });
    }
  );

  // 重启 Agent Session (清除对话历史，重新启动进程)
  server.post<{ Params: { sessionId: string } }>(
    "/api/agent-sessions/:sessionId/restart",
    async (req, reply) => {
      const session = agentSessionManager.getSession(req.params.sessionId);
      if (!session) {
        return reply.code(404).send({ error: "Session not found" });
      }

      const project = opts.storage.projects.getById(session.projectId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      if (!project.path) {
        return reply.code(400).send({ error: "Project has no local path" });
      }

      const restarted = agentSessionManager.restartSession(req.params.sessionId, project.path);
      if (!restarted) {
        return reply.code(500).send({ error: "Failed to restart session" });
      }
      return reply.code(200).send({ success: true });
    }
  );

  // 删除 Agent Session
  server.delete<{ Params: { sessionId: string } }>(
    "/api/agent-sessions/:sessionId",
    async (req, reply) => {
      const deleted = agentSessionManager.deleteSession(req.params.sessionId);
      if (!deleted) {
        return reply.code(404).send({ error: "Session not found" });
      }
      return reply.code(200).send({ success: true });
    }
  );

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
