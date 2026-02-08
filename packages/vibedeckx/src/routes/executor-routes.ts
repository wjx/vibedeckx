import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { randomUUID } from "crypto";
import "../server-types.js";

const routes: FastifyPluginAsync = async (fastify) => {
  // 获取项目的所有 Executor
  fastify.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/executors",
    async (req, reply) => {
      const project = fastify.storage.projects.getById(req.params.projectId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const executors = fastify.storage.executors.getByProjectId(req.params.projectId);
      return reply.code(200).send({ executors });
    }
  );

  // 创建 Executor
  fastify.post<{
    Params: { projectId: string };
    Body: { name: string; command: string; cwd?: string; pty?: boolean };
  }>("/api/projects/:projectId/executors", async (req, reply) => {
    const project = fastify.storage.projects.getById(req.params.projectId);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    const { name, command, cwd, pty } = req.body;
    const id = randomUUID();
    const executor = fastify.storage.executors.create({
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
  fastify.put<{
    Params: { id: string };
    Body: { name?: string; command?: string; cwd?: string | null; pty?: boolean };
  }>("/api/executors/:id", async (req, reply) => {
    const existing = fastify.storage.executors.getById(req.params.id);
    if (!existing) {
      return reply.code(404).send({ error: "Executor not found" });
    }

    const executor = fastify.storage.executors.update(req.params.id, req.body);
    return reply.code(200).send({ executor });
  });

  // 删除 Executor
  fastify.delete<{ Params: { id: string } }>("/api/executors/:id", async (req, reply) => {
    const existing = fastify.storage.executors.getById(req.params.id);
    if (!existing) {
      return reply.code(404).send({ error: "Executor not found" });
    }

    fastify.storage.executors.delete(req.params.id);
    return reply.code(200).send({ success: true });
  });

  // Reorder Executors
  fastify.put<{
    Params: { projectId: string };
    Body: { orderedIds: string[] };
  }>("/api/projects/:projectId/executors/reorder", async (req, reply) => {
    const project = fastify.storage.projects.getById(req.params.projectId);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return reply.code(400).send({ error: "orderedIds must be an array" });
    }

    const existingExecutors = fastify.storage.executors.getByProjectId(req.params.projectId);
    const existingIds = new Set(existingExecutors.map(e => e.id));
    for (const id of orderedIds) {
      if (!existingIds.has(id)) {
        return reply.code(400).send({ error: `Executor ${id} not found in project` });
      }
    }

    fastify.storage.executors.reorder(req.params.projectId, orderedIds);
    return reply.code(200).send({ success: true });
  });
};

export default fp(routes, { name: "executor-routes" });
