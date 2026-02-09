import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { randomUUID } from "crypto";
import "../server-types.js";

const routes: FastifyPluginAsync = async (fastify) => {
  // List tasks for a project (ordered by position)
  fastify.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/tasks",
    async (req, reply) => {
      const project = fastify.storage.projects.getById(req.params.projectId);
      if (!project) {
        return reply.code(404).send({ error: "Project not found" });
      }

      const tasks = fastify.storage.tasks.getByProjectId(req.params.projectId);
      return reply.code(200).send({ tasks });
    }
  );

  // Create task
  fastify.post<{
    Params: { projectId: string };
    Body: { title: string; description?: string; status?: string; priority?: string };
  }>("/api/projects/:projectId/tasks", async (req, reply) => {
    const project = fastify.storage.projects.getById(req.params.projectId);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    const { title, description, status, priority } = req.body;
    if (!title) {
      return reply.code(400).send({ error: "title is required" });
    }

    const id = randomUUID();
    const task = fastify.storage.tasks.create({
      id,
      project_id: req.params.projectId,
      title,
      description,
      status: status as 'todo' | 'in_progress' | 'done' | 'cancelled' | undefined,
      priority: priority as 'low' | 'medium' | 'high' | 'urgent' | undefined,
    });

    return reply.code(201).send({ task });
  });

  // Update task
  fastify.put<{
    Params: { id: string };
    Body: { title?: string; description?: string | null; status?: string; priority?: string; position?: number };
  }>("/api/tasks/:id", async (req, reply) => {
    const existing = fastify.storage.tasks.getById(req.params.id);
    if (!existing) {
      return reply.code(404).send({ error: "Task not found" });
    }

    const task = fastify.storage.tasks.update(req.params.id, {
      title: req.body.title,
      description: req.body.description,
      status: req.body.status as 'todo' | 'in_progress' | 'done' | 'cancelled' | undefined,
      priority: req.body.priority as 'low' | 'medium' | 'high' | 'urgent' | undefined,
      position: req.body.position,
    });
    return reply.code(200).send({ task });
  });

  // Delete task
  fastify.delete<{ Params: { id: string } }>("/api/tasks/:id", async (req, reply) => {
    const existing = fastify.storage.tasks.getById(req.params.id);
    if (!existing) {
      return reply.code(404).send({ error: "Task not found" });
    }

    fastify.storage.tasks.delete(req.params.id);
    return reply.code(200).send({ success: true });
  });

  // Reorder tasks
  fastify.put<{
    Params: { projectId: string };
    Body: { orderedIds: string[] };
  }>("/api/projects/:projectId/tasks/reorder", async (req, reply) => {
    const project = fastify.storage.projects.getById(req.params.projectId);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return reply.code(400).send({ error: "orderedIds must be an array" });
    }

    const existingTasks = fastify.storage.tasks.getByProjectId(req.params.projectId);
    const existingIds = new Set(existingTasks.map(t => t.id));
    for (const id of orderedIds) {
      if (!existingIds.has(id)) {
        return reply.code(400).send({ error: `Task ${id} not found in project` });
      }
    }

    fastify.storage.tasks.reorder(req.params.projectId, orderedIds);
    return reply.code(200).send({ success: true });
  });
};

export default fp(routes, { name: "task-routes" });
