import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import type { Storage } from "../storage/types.js";
import { ProcessManager } from "../process-manager.js";
import { AgentSessionManager } from "../agent-session-manager.js";
import type { RemoteExecutorInfo, RemoteSessionInfo } from "../server-types.js";
import "../server-types.js";

interface SharedServicesOptions {
  storage: Storage;
}

const sharedServices: FastifyPluginAsync<SharedServicesOptions> = async (fastify, opts) => {
  const processManager = new ProcessManager(opts.storage);
  const agentSessionManager = new AgentSessionManager(opts.storage);
  const remoteExecutorMap = new Map<string, RemoteExecutorInfo>();
  const remoteSessionMap = new Map<string, RemoteSessionInfo>();

  fastify.decorate("storage", opts.storage);
  fastify.decorate("processManager", processManager);
  fastify.decorate("agentSessionManager", agentSessionManager);
  fastify.decorate("remoteExecutorMap", remoteExecutorMap);
  fastify.decorate("remoteSessionMap", remoteSessionMap);
};

export default fp(sharedServices, { name: "shared-services" });
