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
