import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import path from "path";
import { randomUUID } from "crypto";
import { mkdir, writeFile, readdir } from "fs/promises";
import type { Project } from "../storage/types.js";
import { selectFolder } from "../dialog.js";
import "../server-types.js";

function sanitizeProject(project: Project) {
  const { remote_api_key: _, ...safe } = project;
  return safe;
}

const routes: FastifyPluginAsync = async (fastify) => {
  // 获取所有项目
  fastify.get("/api/projects", async (req, reply) => {
    const projects = fastify.storage.projects.getAll().map(sanitizeProject);
    return reply.code(200).send({ projects });
  });

  // 获取单个项目
  fastify.get<{ Params: { id: string } }>("/api/projects/:id", async (req, reply) => {
    const project = fastify.storage.projects.getById(req.params.id);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }
    return reply.code(200).send({ project: sanitizeProject(project) });
  });

  // 打开目录选择对话框
  fastify.post("/api/dialog/select-folder", async (req, reply) => {
    const folderPath = await selectFolder();
    if (!folderPath) {
      return reply.code(200).send({ path: null, cancelled: true });
    }
    return reply.code(200).send({ path: folderPath, cancelled: false });
  });

  // Browse directory - for remote access to list directories
  fastify.get<{
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
    } catch {
      return reply.code(400).send({ error: "Failed to read directory" });
    }
  });

  // 创建项目 (unified: local, remote, or both)
  fastify.post<{
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

    if (!projectPath && !remotePath) {
      return reply.code(400).send({ error: "At least one of local path or remote path is required" });
    }

    if (remotePath && (!remoteUrl || !remoteApiKey)) {
      return reply.code(400).send({ error: "Remote URL and API key are required when remote path is provided" });
    }

    if (projectPath) {
      const existing = fastify.storage.projects.getByPath(projectPath);
      if (existing) {
        return reply.code(409).send({ error: "Project with this path already exists" });
      }

      const vibedeckxDir = path.join(projectPath, ".vibedeckx");
      await mkdir(vibedeckxDir, { recursive: true });

      const configPath = path.join(vibedeckxDir, "config.json");
      const config = {
        name,
        created_at: new Date().toISOString(),
      };
      await writeFile(configPath, JSON.stringify(config, null, 2));
    }

    const id = randomUUID();
    const project = fastify.storage.projects.create({
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
  fastify.put<{
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
    const project = fastify.storage.projects.getById(req.params.id);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    const { name, path: newPath, remotePath, remoteUrl, remoteApiKey, agentMode, executorMode } = req.body;

    const effectivePath = newPath !== undefined ? newPath : project.path;
    const effectiveRemotePath = remotePath !== undefined ? remotePath : (project.remote_path ?? null);
    const effectiveRemoteUrl = remoteUrl !== undefined ? remoteUrl : (project.remote_url ?? null);
    const effectiveRemoteApiKey = remoteApiKey !== undefined ? remoteApiKey : (project.remote_api_key ?? null);

    if (!effectivePath && !effectiveRemotePath) {
      return reply.code(400).send({ error: "Project must have at least one of local path or remote path" });
    }

    if (effectiveRemotePath && (!effectiveRemoteUrl || !effectiveRemoteApiKey)) {
      return reply.code(400).send({ error: "Remote URL and API key are required when remote path is provided" });
    }

    if (newPath && newPath !== project.path) {
      const existing = fastify.storage.projects.getByPath(newPath);
      if (existing && existing.id !== req.params.id) {
        return reply.code(409).send({ error: "Another project already uses this path" });
      }

      const vibedeckxDir = path.join(newPath, ".vibedeckx");
      await mkdir(vibedeckxDir, { recursive: true });
      const configPath = path.join(vibedeckxDir, "config.json");
      const config = {
        name: name ?? project.name,
        created_at: new Date().toISOString(),
      };
      await writeFile(configPath, JSON.stringify(config, null, 2));
    }

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

    const updated = fastify.storage.projects.update(req.params.id, updateOpts);
    if (!updated) {
      return reply.code(404).send({ error: "Project not found" });
    }

    return reply.code(200).send({ project: sanitizeProject(updated) });
  });

  // 删除项目
  fastify.delete<{ Params: { id: string } }>("/api/projects/:id", async (req, reply) => {
    const project = fastify.storage.projects.getById(req.params.id);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    fastify.storage.projects.delete(req.params.id);
    return reply.code(200).send({ success: true });
  });

  // 获取项目目录文件列表
  fastify.get<{ Params: { id: string } }>("/api/projects/:id/files", async (req, reply) => {
    const project = fastify.storage.projects.getById(req.params.id);
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
          if (a.type !== b.type) {
            return a.type === "directory" ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

      return reply.code(200).send({ files });
    } catch {
      return reply.code(500).send({ error: "Failed to read directory" });
    }
  });
};

export default fp(routes, { name: "project-routes" });
