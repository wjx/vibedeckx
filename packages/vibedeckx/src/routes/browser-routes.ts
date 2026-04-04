import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { requireAuth } from "../server.js";
import "../server-types.js";

const routes: FastifyPluginAsync = async (fastify) => {
  // Start browser session
  fastify.post<{
    Params: { id: string };
    Body: { branch?: string };
  }>("/api/projects/:id/browser", async (req, reply) => {
    if (requireAuth(req, reply) === null) return;

    const { id: projectId } = req.params;
    const { branch } = req.body || {};

    try {
      const session = await fastify.browserManager.startSession(
        projectId,
        branch ?? null,
      );
      return reply.code(200).send(session);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start browser";
      return reply.code(500).send({ error: msg });
    }
  });

  // Get browser session status
  fastify.get<{
    Params: { id: string };
  }>("/api/projects/:id/browser", async (req, reply) => {
    if (requireAuth(req, reply) === null) return;

    const { id: projectId } = req.params;
    const session = fastify.browserManager.getSession(projectId);

    if (!session) {
      return reply.code(404).send({ error: "No browser session" });
    }

    return reply.code(200).send(session);
  });

  // Stop browser session
  fastify.delete<{
    Params: { id: string };
  }>("/api/projects/:id/browser", async (req, reply) => {
    if (requireAuth(req, reply) === null) return;

    const { id: projectId } = req.params;
    const stopped = await fastify.browserManager.stopSession(projectId);

    if (!stopped) {
      return reply.code(404).send({ error: "No browser session to stop" });
    }

    return reply.code(200).send({ ok: true });
  });

  // Navigate browser to URL
  fastify.post<{
    Params: { id: string };
    Body: { url: string };
  }>("/api/projects/:id/browser/navigate", async (req, reply) => {
    if (requireAuth(req, reply) === null) return;

    const { id: projectId } = req.params;
    const { url } = req.body;

    if (!url) {
      return reply.code(400).send({ error: "URL is required" });
    }

    try {
      const result = await fastify.browserManager.navigate(projectId, url);
      if (!result) {
        return reply.code(404).send({ error: "No browser session. Start one first." });
      }
      return reply.code(200).send(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Navigation failed";
      return reply.code(500).send({ error: msg });
    }
  });

  // Report browser error from injected script
  fastify.post<{
    Params: { id: string };
    Body: { type: string; data: Record<string, unknown> };
  }>("/api/projects/:id/browser/error", async (req, reply) => {
    if (requireAuth(req, reply) === null) return;

    const { id: projectId } = req.params;
    const { type, data } = req.body;

    console.log(`[BrowserRoutes] Error report for project ${projectId}: ${type}`, data);

    return reply.code(200).send({ ok: true });
  });
};

export default fp(routes, { name: "browser-routes" });
