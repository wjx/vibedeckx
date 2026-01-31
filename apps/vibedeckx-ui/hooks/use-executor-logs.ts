"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getWebSocketUrl, type LogMessage } from "@/lib/api";

export type ConnectionStatus = "connecting" | "connected" | "closed" | "error";

export interface UseExecutorLogsResult {
  logs: LogMessage[];
  status: ConnectionStatus;
  exitCode: number | null;
  clearLogs: () => void;
}

export function useExecutorLogs(processId: string | null): UseExecutorLogsResult {
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("closed");
  const [exitCode, setExitCode] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const clearLogs = useCallback(() => {
    setLogs([]);
    setExitCode(null);
  }, []);

  useEffect(() => {
    if (!processId) {
      setStatus("closed");
      return;
    }

    // Reset state for new process
    setLogs([]);
    setExitCode(null);
    setStatus("connecting");

    const wsUrl = getWebSocketUrl(`/api/executor-processes/${processId}/logs`);
    console.log(`[useExecutorLogs] Connecting to WebSocket: ${wsUrl}`);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log(`[useExecutorLogs] WebSocket connected`);
      setStatus("connected");
    };

    ws.onmessage = (event) => {
      console.log(`[useExecutorLogs] Received message:`, event.data);
      try {
        const msg: LogMessage = JSON.parse(event.data);

        if (msg.type === "finished") {
          setExitCode(msg.exitCode);
          setStatus("closed");
        } else if (msg.type === "error") {
          setStatus("error");
        } else {
          setLogs((prev) => [...prev, msg]);
        }
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    ws.onerror = (error) => {
      console.error(`[useExecutorLogs] WebSocket error:`, error);
      setStatus("error");
    };

    ws.onclose = (event) => {
      console.log(`[useExecutorLogs] WebSocket closed:`, event.code, event.reason);
      if (status !== "error") {
        setStatus("closed");
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [processId]);

  return { logs, status, exitCode, clearLogs };
}
