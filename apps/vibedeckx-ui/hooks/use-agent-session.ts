"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { produce } from "immer";
import { getWebSocketUrl } from "@/lib/api";

// ============ Types ============

export type AgentMessage =
  | { type: "user"; content: string; timestamp: number }
  | { type: "assistant"; content: string; partial?: boolean; timestamp: number }
  | { type: "tool_use"; tool: string; input: unknown; toolUseId?: string; timestamp: number }
  | { type: "tool_result"; tool: string; output: string; toolUseId?: string; timestamp: number }
  | { type: "thinking"; content: string; timestamp: number }
  | { type: "error"; message: string; timestamp: number }
  | { type: "system"; content: string; timestamp: number };

export type AgentSessionStatus = "running" | "stopped" | "error";

export interface AgentSession {
  id: string;
  projectId: string;
  worktreePath: string;
  status: AgentSessionStatus;
}

// ============ JSON Patch Types (RFC 6902) ============

type PatchOperation = "add" | "replace" | "remove";

interface PatchEntry {
  op: PatchOperation;
  path: string;
  value?: PatchValue;
}

type Patch = PatchEntry[];

type PatchValue =
  | { type: "ENTRY"; content: AgentMessage }
  | { type: "STATUS"; content: AgentSessionStatus }
  | { type: "READY"; content: true }
  | { type: "FINISHED"; content: true };

// WebSocket message types
type AgentWsMessage =
  | { JsonPatch: Patch }
  | { Ready: true }
  | { finished: true }
  | { error: string };

// Container for patch target
interface PatchContainer {
  entries: AgentMessage[];
  status: AgentSessionStatus;
}

// ============ API Functions ============

function getApiBase(): string {
  if (typeof window === "undefined") {
    return "";
  }
  // Local dev mode: frontend on 3000, backend on 5173
  if (window.location.hostname === "localhost" && window.location.port === "3000") {
    return "http://localhost:5173";
  }
  // Production or tunnel access: use relative path
  return "";
}

async function createOrGetSession(
  projectId: string,
  worktreePath: string
): Promise<{ session: AgentSession; messages: AgentMessage[] }> {
  const response = await fetch(`${getApiBase()}/api/projects/${projectId}/agent-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ worktreePath }),
  });

  if (!response.ok) {
    throw new Error("Failed to create session");
  }

  return response.json();
}

async function sendMessageToSession(sessionId: string, content: string): Promise<void> {
  const response = await fetch(`${getApiBase()}/api/agent-sessions/${sessionId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw new Error("Failed to send message");
  }
}

async function restartSessionApi(sessionId: string): Promise<void> {
  const response = await fetch(`${getApiBase()}/api/agent-sessions/${sessionId}/restart`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to restart session");
  }
}

// ============ Patch Application ============

/**
 * Apply a JSON Patch to the container using Immer for structural sharing
 */
function applyPatch(container: PatchContainer, patch: Patch): PatchContainer {
  return produce(container, (draft) => {
    for (const entry of patch) {
      const { op, path, value } = entry;

      // Handle special clearAll patch (path is "/entries" with replace)
      if (path === "/entries" && op === "replace") {
        // Check if it's the special clearAll marker
        if (value?.type === "ENTRY" && value.content?.type === "system" && value.content?.content === "__CLEAR_ALL__") {
          console.log("[JsonPatch] Received clearAll signal - clearing all entries");
          draft.entries = [];
          continue;
        }
      }

      // Parse path: /entries/0 or /status
      if (path.startsWith("/entries/")) {
        const indexStr = path.replace("/entries/", "");
        const index = parseInt(indexStr, 10);

        if (isNaN(index)) {
          console.warn(`[JsonPatch] Invalid index in path: ${path}`);
          continue;
        }

        if (value?.type !== "ENTRY") {
          console.warn(`[JsonPatch] Expected ENTRY type for entries path`);
          continue;
        }

        switch (op) {
          case "add":
            // Ensure array is large enough
            while (draft.entries.length <= index) {
              draft.entries.push(null as unknown as AgentMessage);
            }
            draft.entries[index] = value.content;
            break;

          case "replace":
            if (index < draft.entries.length) {
              draft.entries[index] = value.content;
            } else {
              console.warn(`[JsonPatch] Replace index out of bounds: ${index}`);
            }
            break;

          case "remove":
            if (index < draft.entries.length) {
              // Mark as removed (filter later if needed)
              draft.entries.splice(index, 1);
            }
            break;
        }
      } else if (path === "/status") {
        if (value?.type === "STATUS") {
          draft.status = value.content;
        }
      }
    }
  });
}

/**
 * Deduplicate patches by path - last operation for each path wins
 */
function deduplicatePatches(patches: Patch[]): Patch {
  const lastByPath = new Map<string, PatchEntry>();

  for (const patch of patches) {
    for (const entry of patch) {
      lastByPath.set(entry.path, entry);
    }
  }

  return Array.from(lastByPath.values());
}

// ============ Hook ============

export function useAgentSession(projectId: string | null, worktreePath: string) {
  const [session, setSession] = useState<AgentSession | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [status, setStatus] = useState<AgentSessionStatus>("stopped");
  const [isConnected, setIsConnected] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef(0);
  const containerRef = useRef<PatchContainer>({ entries: [], status: "stopped" });
  const finishedRef = useRef(false);
  const shouldAutoStartRef = useRef(true); // Auto-start on mount and worktree switch

  // Connect WebSocket to session
  const connectWebSocket = useCallback((sessionId: string) => {
    // Prevent duplicate connections
    if (wsRef.current?.readyState === WebSocket.OPEN ||
        wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    // Reset state for new connection
    containerRef.current = { entries: [], status: "running" };
    finishedRef.current = false;

    const wsUrl = getWebSocketUrl(`/api/agent-sessions/${sessionId}/stream`);
    console.log("[AgentSession] Connecting to WebSocket:", wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[AgentSession] WebSocket connected");
      setIsConnected(true);
      setError(null);
      reconnectAttemptRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as AgentWsMessage;

        // Handle JsonPatch messages
        if ("JsonPatch" in msg) {
          const patch = msg.JsonPatch;

          // Apply patch to container using Immer
          containerRef.current = applyPatch(containerRef.current, patch);

          // Update React state
          setMessages([...containerRef.current.entries.filter(Boolean)]);
          setStatus(containerRef.current.status);
          return;
        }

        // Handle Ready signal - history complete
        if ("Ready" in msg) {
          console.log("[AgentSession] Received Ready signal - history complete");
          setIsInitialized(true);
          return;
        }

        // Handle finished signal - don't reconnect
        if ("finished" in msg) {
          console.log("[AgentSession] Received finished signal");
          finishedRef.current = true;
          ws.close(1000, "finished");
          return;
        }

        // Handle error
        if ("error" in msg) {
          console.error("[AgentSession] Server error:", msg.error);
          setError(msg.error);
          return;
        }
      } catch (e) {
        console.error("[AgentSession] Failed to parse message:", e);
      }
    };

    ws.onclose = (event) => {
      console.log("[AgentSession] WebSocket disconnected", event.code, event.reason);
      setIsConnected(false);

      // Don't reconnect if finished or intentionally closed
      if (finishedRef.current || event.code === 1000) {
        return;
      }

      // Exponential backoff reconnection: 1s, 2s, 4s, 8s (max)
      const delay = Math.min(8000, 1000 * Math.pow(2, reconnectAttemptRef.current));
      reconnectAttemptRef.current++;

      reconnectTimeoutRef.current = setTimeout(() => {
        if (session?.id && !finishedRef.current) {
          connectWebSocket(session.id);
        }
      }, delay);
    };

    ws.onerror = (error) => {
      console.error("[AgentSession] WebSocket error:", error);
    };
  }, [session?.id]);

  // Start or get existing session - returns the session for immediate use
  const startSession = useCallback(async (): Promise<AgentSession | null> => {
    if (!projectId) return null;

    setIsLoading(true);
    setError(null);
    setIsInitialized(false);

    try {
      const { session: newSession } =
        await createOrGetSession(projectId, worktreePath);

      setSession(newSession);
      setStatus(newSession.status);

      // Connect WebSocket - it will receive history via patches
      connectWebSocket(newSession.id);

      // Return session for immediate use (avoids React state timing issues)
      return newSession;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Failed to start session";
      setError(errorMsg);
      console.error("[AgentSession] Failed to start session:", e);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, worktreePath, connectWebSocket]);

  // Send user message - optionally accepts sessionId for immediate use after session creation
  const sendMessage = useCallback(
    async (content: string, sessionId?: string) => {
      const targetSessionId = sessionId || session?.id;
      if (!targetSessionId || !content.trim()) return;

      try {
        // Send via REST API (more reliable than WebSocket for important actions)
        await sendMessageToSession(targetSessionId, content.trim());
      } catch (e) {
        console.error("[AgentSession] Failed to send message:", e);
        setError("Failed to send message");
      }
    },
    [session?.id]
  );

  // Restart session - clears conversation and respawns Claude Code process
  const restartSession = useCallback(async () => {
    if (!session?.id) return;

    setIsLoading(true);
    setError(null);

    try {
      await restartSessionApi(session.id);
      // The WebSocket will receive the clearAll patch and status update
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : "Failed to restart session";
      setError(errorMsg);
      console.error("[AgentSession] Failed to restart session:", e);
    } finally {
      setIsLoading(false);
    }
  }, [session?.id]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        finishedRef.current = true; // Prevent reconnect on unmount
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  // Reset session when projectId or worktreePath changes
  useEffect(() => {
    // Close existing WebSocket
    if (wsRef.current) {
      finishedRef.current = true;
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Reset all state
    setSession(null);
    setMessages([]);
    setStatus("stopped");
    setIsConnected(false);
    setIsInitialized(false);
    setError(null);
    containerRef.current = { entries: [], status: "stopped" };
    finishedRef.current = false;
    reconnectAttemptRef.current = 0;

    // Mark that we need to auto-start session after reset
    shouldAutoStartRef.current = true;
  }, [projectId, worktreePath]);

  // Auto-start session after mount or worktree switch
  useEffect(() => {
    if (shouldAutoStartRef.current && projectId && !session && !isLoading) {
      shouldAutoStartRef.current = false;
      startSession();
    }
  }, [projectId, session, isLoading, startSession]);

  // Reconnect when session changes
  useEffect(() => {
    if (session?.id && !isConnected && !finishedRef.current) {
      connectWebSocket(session.id);
    }
  }, [session?.id, isConnected, connectWebSocket]);

  return {
    session,
    messages,
    status,
    isConnected,
    isInitialized,
    isLoading,
    error,
    startSession,
    sendMessage,
    restartSession,
  };
}
