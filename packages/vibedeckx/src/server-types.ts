import type { Storage } from "./storage/types.js";
import type { ProcessManager } from "./process-manager.js";
import type { AgentSessionManager } from "./agent-session-manager.js";

export interface RemoteExecutorInfo {
  remoteUrl: string;
  remoteApiKey: string;
  remoteProcessId: string;
}

export interface RemoteSessionInfo {
  remoteUrl: string;
  remoteApiKey: string;
  remoteSessionId: string;
}

declare module "fastify" {
  interface FastifyInstance {
    storage: Storage;
    processManager: ProcessManager;
    agentSessionManager: AgentSessionManager;
    remoteExecutorMap: Map<string, RemoteExecutorInfo>;
    remoteSessionMap: Map<string, RemoteSessionInfo>;
  }
}
