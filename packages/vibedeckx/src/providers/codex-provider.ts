import { execFileSync } from "child_process";
import type { AgentType } from "../agent-types.js";
import type { AgentProvider, SpawnConfig, ParsedAgentEvent } from "../agent-provider.js";

interface CodexSessionState {
  threadId: string | null;
  rpcIdCounter: number;
  initialized: boolean;
  pendingRequests: Map<number, string>;
}

export class CodexProvider implements AgentProvider {
  private binaryPath: string | null | undefined = undefined;
  private sessions = new Map<string, CodexSessionState>();

  getAgentType(): AgentType {
    return "codex";
  }

  getDisplayName(): string {
    return "Codex";
  }

  detectBinary(): string | null {
    if (this.binaryPath !== undefined) {
      return this.binaryPath;
    }
    try {
      const cmd = process.platform === "win32" ? "where" : "which";
      const result = execFileSync(cmd, ["codex"], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"],
      }).trim();
      this.binaryPath = result || null;
      console.log(`[CodexProvider] Native codex binary found: ${result}`);
    } catch {
      this.binaryPath = null;
      console.log(`[CodexProvider] Native codex binary not found, will use npx`);
    }
    return this.binaryPath;
  }

  buildSpawnConfig(_cwd: string, _permissionMode: "plan" | "edit"): SpawnConfig {
    const nativeBinary = this.detectBinary();
    if (nativeBinary) {
      return { command: nativeBinary, args: ["app-server"], shell: false };
    }
    return {
      command: "npx",
      args: ["-y", "@openai/codex", "app-server"],
      shell: false,
    };
  }

  parseStdoutLine(_line: string, _sessionId: string): ParsedAgentEvent[] {
    // Stub — implemented in task 5.5
    return [];
  }

  formatUserInput(_content: string, _sessionId: string): string {
    // Stub — implemented in task 5.10
    return "";
  }

  formatApprovalResponse(_requestId: string, _decision: string, _sessionId: string): string {
    // Stub — implemented in task 5.11
    return "";
  }

  onSessionCreated(sessionId: string): void {
    this.sessions.set(sessionId, {
      threadId: null,
      rpcIdCounter: 1,
      initialized: false,
      pendingRequests: new Map(),
    });
  }

  onSessionDestroyed(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** Get session state, creating default if missing (defensive). */
  getSessionState(sessionId: string): CodexSessionState {
    let state = this.sessions.get(sessionId);
    if (!state) {
      state = {
        threadId: null,
        rpcIdCounter: 1,
        initialized: false,
        pendingRequests: new Map(),
      };
      this.sessions.set(sessionId, state);
    }
    return state;
  }
}
