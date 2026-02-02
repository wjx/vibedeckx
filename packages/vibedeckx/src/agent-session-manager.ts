import { spawn, type ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import type { WebSocket } from "@fastify/websocket";
import type { Storage } from "./storage/types.js";
import type {
  AgentMessage,
  AgentSessionStatus,
  ClaudeOutputMessage,
  ClaudeUserInput,
  ClaudeContentBlock,
} from "./agent-types.js";
import { ConversationPatch, type Patch, type AgentWsMessage } from "./conversation-patch.js";
import { EntryIndexProvider } from "./entry-index-provider.js";

// ============ Session Store Types ============

interface MessageStore {
  /** All patches sent for this session (for history replay) */
  patches: Patch[];
  /** Reconstructed entries from patches (for quick access) */
  entries: AgentMessage[];
  /** Index provider for monotonic indices */
  indexProvider: EntryIndexProvider;
  /** Index of the current streaming assistant message, or null if not streaming */
  currentAssistantIndex: number | null;
}

interface RunningSession {
  id: string;
  projectId: string;
  worktreePath: string;
  process: ChildProcess;
  store: MessageStore;
  subscribers: Set<WebSocket>;
  status: AgentSessionStatus;
  buffer: string; // Buffer for incomplete JSON lines
}

export class AgentSessionManager {
  private sessions: Map<string, RunningSession> = new Map();
  private storage: Storage;

  constructor(storage: Storage) {
    this.storage = storage;
  }

  /**
   * Get or create an agent session for a worktree
   */
  getOrCreateSession(
    projectId: string,
    worktreePath: string,
    projectPath: string
  ): string {
    // Check if session already exists in memory
    for (const [id, session] of this.sessions) {
      if (
        session.projectId === projectId &&
        session.worktreePath === worktreePath &&
        session.status === "running"
      ) {
        console.log(`[AgentSession] Returning existing session ${id}`);
        return id;
      }
    }

    // Check database for existing session
    const existingSession = this.storage.agentSessions.getByWorktree(
      projectId,
      worktreePath
    );
    if (existingSession && this.sessions.has(existingSession.id)) {
      console.log(`[AgentSession] Returning existing session from DB ${existingSession.id}`);
      return existingSession.id;
    }

    // Create new session
    const sessionId = randomUUID();
    console.log(`[AgentSession] Creating new session ${sessionId}`);

    // Calculate absolute worktree path
    const absoluteWorktreePath =
      worktreePath === "."
        ? projectPath
        : `${projectPath}/${worktreePath}`;

    // Create session in database
    this.storage.agentSessions.create({
      id: sessionId,
      project_id: projectId,
      worktree_path: worktreePath,
    });

    // Initialize message store with EntryIndexProvider
    const indexProvider = new EntryIndexProvider();

    const store: MessageStore = {
      patches: [],
      entries: [],
      indexProvider,
      currentAssistantIndex: null,
    };

    // Initialize running session
    const runningSession: RunningSession = {
      id: sessionId,
      projectId,
      worktreePath,
      process: null as unknown as ChildProcess,
      store,
      subscribers: new Set(),
      status: "running",
      buffer: "",
    };

    this.sessions.set(sessionId, runningSession);

    // Spawn Claude Code process
    this.spawnClaudeCode(runningSession, absoluteWorktreePath);

    return sessionId;
  }

  /**
   * Spawn Claude Code CLI process
   */
  private spawnClaudeCode(session: RunningSession, cwd: string): void {
    console.log(`[AgentSession] Spawning Claude Code in ${cwd}`);

    const args = [
      "-y",
      "@anthropic-ai/claude-code",
      "-p",
      "--output-format=stream-json",
      "--input-format=stream-json",
      "--dangerously-skip-permissions",
      "--verbose",
    ];

    const childProcess = spawn("npx", args, {
      cwd,
      env: { ...process.env, FORCE_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });

    session.process = childProcess;

    console.log(`[AgentSession] Process ${session.id} started, PID: ${childProcess.pid}`);

    // Handle stdout (JSON messages from Claude)
    childProcess.stdout?.on("data", (data: Buffer) => {
      this.handleStdout(session, data.toString());
    });

    // Handle stderr (errors and debug info)
    childProcess.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      console.log(`[AgentSession] stderr: ${text}`);
      // Don't treat all stderr as errors - Claude Code uses it for progress
    });

    // Handle process exit
    childProcess.on("close", (code) => {
      console.log(`[AgentSession] Process ${session.id} exited with code ${code}`);

      // Don't update status or send finished signal if this is an old process
      // (happens when we restart - old process closes but new one is already running)
      if (session.process !== childProcess) {
        console.log(`[AgentSession] Old process closed, new process already running, skipping finished signal`);
        return;
      }

      session.status = code === 0 ? "stopped" : "error";
      this.storage.agentSessions.updateStatus(session.id, session.status);

      // Send status patch and finished signal
      this.broadcastPatch(session.id, ConversationPatch.updateStatus(session.status));
      this.broadcastRaw(session.id, { finished: true });
    });

    // Handle spawn errors
    childProcess.on("error", (error) => {
      console.error(`[AgentSession] Process ${session.id} error:`, error);
      session.status = "error";
      this.storage.agentSessions.updateStatus(session.id, "error");
      this.pushEntry(session.id, {
        type: "error",
        message: error.message,
        timestamp: Date.now(),
      }, true);
    });
  }

  /**
   * Handle stdout data from Claude Code
   */
  private handleStdout(session: RunningSession, data: string): void {
    // Add to buffer
    session.buffer += data;

    // Process complete lines
    const lines = session.buffer.split("\n");
    session.buffer = lines.pop() || ""; // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const json = JSON.parse(line) as ClaudeOutputMessage;
        this.processClaudeMessage(session.id, json);
      } catch (e) {
        // Not JSON, might be debug output
        console.log(`[AgentSession] Non-JSON stdout: ${line.substring(0, 100)}`);
      }
    }
  }

  /**
   * Process a parsed Claude Code message
   */
  private processClaudeMessage(sessionId: string, msg: ClaudeOutputMessage): void {
    const timestamp = Date.now();
    const session = this.sessions.get(sessionId);
    if (!session) return;

    if (msg.type === "assistant") {
      const assistantMsg = msg as { type: "assistant"; message?: { content?: ClaudeContentBlock[] } };
      const content = assistantMsg.message?.content;
      if (!content) return;

      for (const block of content) {
        this.processContentBlock(sessionId, block, timestamp);
      }
      return;
    }

    if (msg.type === "user") {
      // Echo of user message - we already added it when sending
      return;
    }

    if (msg.type === "system") {
      const systemMsg = msg as { type: "system"; message?: string };
      if (systemMsg.message) {
        // Clear current assistant key - system message breaks streaming
        session.store.currentAssistantIndex = null;
        this.pushEntry(sessionId, {
          type: "system",
          content: systemMsg.message,
          timestamp,
        }, true);
      }
      return;
    }

    if (msg.type === "result") {
      const resultMsg = msg as { type: "result"; subtype?: string; error?: string };
      if (resultMsg.subtype === "error" && resultMsg.error) {
        // Clear current assistant key - error breaks streaming
        session.store.currentAssistantIndex = null;
        this.pushEntry(sessionId, {
          type: "error",
          message: resultMsg.error,
          timestamp,
        }, true);
      }
      return;
    }

    // Log unknown message types for debugging
    console.log(`[AgentSession] Unknown message type: ${msg.type}`);
  }

  /**
   * Process a content block from assistant message
   */
  private processContentBlock(
    sessionId: string,
    block: ClaudeContentBlock,
    timestamp: number
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    switch (block.type) {
      case "text":
        // For text blocks, use streaming update pattern
        this.updateAssistantMessage(sessionId, block.text, timestamp);
        break;

      case "tool_use":
        // Tool use breaks the assistant streaming
        session.store.currentAssistantIndex = null;
        this.pushEntry(sessionId, {
          type: "tool_use",
          tool: block.name,
          input: block.input,
          toolUseId: block.id,
          timestamp,
        }, true);
        break;

      case "tool_result":
        // Tool result is always new
        session.store.currentAssistantIndex = null;
        this.pushEntry(sessionId, {
          type: "tool_result",
          tool: "",
          output: typeof block.content === "string" ? block.content : JSON.stringify(block.content),
          toolUseId: block.tool_use_id,
          timestamp,
        }, true);
        break;

      case "thinking":
        // Thinking is always new
        session.store.currentAssistantIndex = null;
        this.pushEntry(sessionId, {
          type: "thinking",
          content: block.thinking,
          timestamp,
        }, true);
        break;
    }
  }

  /**
   * Update or add an assistant message using JSON Patch semantics
   * This is the key method that handles streaming updates correctly
   */
  private updateAssistantMessage(sessionId: string, content: string, timestamp: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const { store } = session;

    // Check if we have an ongoing assistant message (streaming update)
    if (store.currentAssistantIndex !== null) {
      const existingIndex = store.currentAssistantIndex;
      const message: AgentMessage = {
        type: "assistant",
        content,
        timestamp,
      };
      // Update the entry in our store
      store.entries[existingIndex] = message;
      // Create and broadcast REPLACE patch
      const patch = ConversationPatch.replaceEntry(existingIndex, message);
      store.patches.push(patch);
      this.broadcastPatch(sessionId, patch);
      return;
    }

    // Start new assistant message (ADD)
    const message: AgentMessage = {
      type: "assistant",
      content,
      timestamp,
    };
    const index = this.pushEntry(sessionId, message, true);
    // Remember this index for streaming updates
    store.currentAssistantIndex = index;
  }

  /**
   * Push a new entry with ADD patch
   */
  private pushEntry(
    sessionId: string,
    message: AgentMessage,
    broadcast: boolean = true
  ): number {
    const session = this.sessions.get(sessionId);
    if (!session) return -1;

    const { store } = session;

    // Get next index from provider
    const index = store.indexProvider.next();

    // Store the entry
    store.entries[index] = message;

    // Create ADD patch
    const patch = ConversationPatch.addEntry(index, message);
    store.patches.push(patch);

    if (broadcast) {
      this.broadcastPatch(sessionId, patch);
    }

    return index;
  }

  /**
   * Send a user message to the agent
   */
  sendUserMessage(sessionId: string, content: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== "running") {
      return false;
    }

    // Clear current assistant key - user message breaks streaming
    session.store.currentAssistantIndex = null;

    // Add user message with ADD patch
    this.pushEntry(sessionId, {
      type: "user",
      content,
      timestamp: Date.now(),
    }, true);

    // Send to Claude Code stdin
    const input: ClaudeUserInput = {
      type: "user",
      message: {
        role: "user",
        content,
      },
    };

    try {
      session.process.stdin?.write(JSON.stringify(input) + "\n");
      return true;
    } catch (error) {
      console.error(`[AgentSession] Failed to send message:`, error);
      return false;
    }
  }

  /**
   * Subscribe to session updates (WebSocket connection)
   */
  subscribe(sessionId: string, ws: WebSocket): (() => void) | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    session.subscribers.add(ws);

    // Send all historical patches to replay state
    for (const patch of session.store.patches) {
      const msg: AgentWsMessage = { JsonPatch: patch };
      ws.send(JSON.stringify(msg));
    }

    // Send Ready signal to indicate history is complete
    ws.send(JSON.stringify({ Ready: true }));

    // Send current status
    const statusPatch = ConversationPatch.updateStatus(session.status);
    ws.send(JSON.stringify({ JsonPatch: statusPatch }));

    // Return unsubscribe function
    return () => {
      session.subscribers.delete(ws);
    };
  }

  /**
   * Get all messages for a session (reconstructed from patches)
   */
  getMessages(sessionId: string): AgentMessage[] {
    const session = this.sessions.get(sessionId);
    return session?.store.entries.filter(Boolean) ?? [];
  }

  /**
   * Get session info
   */
  getSession(sessionId: string): RunningSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  /**
   * Get session by worktree
   */
  getSessionByWorktree(projectId: string, worktreePath: string): RunningSession | null {
    for (const session of this.sessions.values()) {
      if (session.projectId === projectId && session.worktreePath === worktreePath) {
        return session;
      }
    }
    return null;
  }

  /**
   * Check if a session is running
   */
  isRunning(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.status === "running";
  }

  /**
   * Stop a session
   */
  stopSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    try {
      session.process.kill("SIGTERM");
      session.status = "stopped";
      this.storage.agentSessions.updateStatus(sessionId, "stopped");
      this.broadcastPatch(sessionId, ConversationPatch.updateStatus("stopped"));
      this.broadcastRaw(sessionId, { finished: true });
      return true;
    } catch (error) {
      console.error(`[AgentSession] Failed to stop session:`, error);
      return false;
    }
  }

  /**
   * Delete a session (stop and remove)
   */
  deleteSession(sessionId: string): boolean {
    this.stopSession(sessionId);
    this.sessions.delete(sessionId);
    this.storage.agentSessions.delete(sessionId);
    return true;
  }

  /**
   * Restart a session (stop process, clear history, respawn)
   * Returns the same session ID with a fresh conversation
   */
  restartSession(sessionId: string, projectPath: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    console.log(`[AgentSession] Restarting session ${sessionId}`);

    // 1. Kill the existing process
    try {
      session.process.kill("SIGTERM");
    } catch (error) {
      console.error(`[AgentSession] Failed to kill process:`, error);
    }

    // 2. Clear message store
    session.store.patches = [];
    session.store.entries = [];
    session.store.indexProvider.reset();
    session.store.currentAssistantIndex = null;
    session.buffer = "";

    // 3. Broadcast clear signal to all subscribers
    // Send a special patch to clear all entries on the client
    const clearPatch = ConversationPatch.clearAll();
    this.broadcastPatch(sessionId, clearPatch);

    // 4. Update status to running
    session.status = "running";
    this.storage.agentSessions.updateStatus(sessionId, "running");
    this.broadcastPatch(sessionId, ConversationPatch.updateStatus("running"));

    // 5. Calculate absolute worktree path and respawn
    const absoluteWorktreePath =
      session.worktreePath === "."
        ? projectPath
        : `${projectPath}/${session.worktreePath}`;

    this.spawnClaudeCode(session, absoluteWorktreePath);

    return true;
  }

  /**
   * Broadcast a JSON patch to all subscribers
   */
  private broadcastPatch(sessionId: string, patch: Patch): void {
    const msg: AgentWsMessage = { JsonPatch: patch };
    this.broadcastRaw(sessionId, msg);
  }

  /**
   * Broadcast a raw message to all subscribers
   */
  private broadcastRaw(sessionId: string, message: AgentWsMessage): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const json = JSON.stringify(message);
    for (const ws of session.subscribers) {
      try {
        ws.send(json);
      } catch (error) {
        // WebSocket might be closed
        session.subscribers.delete(ws);
      }
    }
  }
}
