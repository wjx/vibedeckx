import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import path from "path";
import { parseDiffOutput } from "../utils/diff-parser.js";
import { proxyToRemote } from "../utils/remote-proxy.js";
import "../server-types.js";

const routes: FastifyPluginAsync = async (fastify) => {
  // Get diff for a path (path-based, for remote execution)
  fastify.get<{
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

  // Get git diff for uncommitted changes (project-based)
  fastify.get<{
    Params: { id: string };
    Querystring: { worktreePath?: string };
  }>("/api/projects/:id/diff", async (req, reply) => {
    const project = fastify.storage.projects.getById(req.params.id);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    const worktreePath = req.query.worktreePath;

    // Proxy to remote if this is a remote-only project
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
};

export default fp(routes, { name: "diff-routes" });
