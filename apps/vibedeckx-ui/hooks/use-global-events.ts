"use client";

import { useEffect, useRef } from "react";
import { getAuthToken } from "@/lib/api";

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  if (window.location.hostname === "localhost" && window.location.port === "3000") {
    return "http://localhost:5173";
  }
  return "";
}

type SessionStatusEvent = {
  type: "session:status";
  projectId: string;
  branch: string | null;
  sessionId: string;
  status: "running" | "stopped" | "error";
};

type SessionFinishedEvent = {
  type: "session:finished";
  projectId: string;
  branch: string | null;
  sessionId: string;
};

type SessionTaskCompletedEvent = {
  type: "session:taskCompleted";
  projectId: string;
  branch: string | null;
  sessionId: string;
  duration_ms?: number;
  cost_usd?: number;
  input_tokens?: number;
  output_tokens?: number;
};

type TaskChangedEvent = {
  type: "task:created" | "task:updated" | "task:deleted";
  projectId: string;
};

type GlobalEvent = SessionStatusEvent | SessionFinishedEvent | SessionTaskCompletedEvent | TaskChangedEvent;

interface UseGlobalEventsOptions {
  onSessionStatus?: (branch: string | null, status: "running" | "stopped" | "error") => void;
  onSessionFinished?: (branch: string | null) => void;
  onSessionTaskCompleted?: (branch: string | null, stats: { duration_ms?: number; cost_usd?: number; input_tokens?: number; output_tokens?: number }) => void;
  onTaskChanged?: () => void;
}

export function useGlobalEvents(
  projectId: string | null,
  options: UseGlobalEventsOptions
) {
  const onSessionStatusRef = useRef(options.onSessionStatus);
  const onSessionFinishedRef = useRef(options.onSessionFinished);
  const onSessionTaskCompletedRef = useRef(options.onSessionTaskCompleted);
  const onTaskChangedRef = useRef(options.onTaskChanged);

  // Keep refs in sync
  useEffect(() => {
    onSessionStatusRef.current = options.onSessionStatus;
    onSessionFinishedRef.current = options.onSessionFinished;
    onSessionTaskCompletedRef.current = options.onSessionTaskCompleted;
    onTaskChangedRef.current = options.onTaskChanged;
  });

  useEffect(() => {
    if (!projectId) return;

    const token = getAuthToken();
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";
    const url = `${getApiBase()}/api/events${tokenParam}`;
    const es = new EventSource(url);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as GlobalEvent;

        // Filter to current project
        if (data.projectId !== projectId) return;

        if (data.type === "session:status") {
          onSessionStatusRef.current?.(data.branch, data.status);
        } else if (data.type === "session:finished") {
          onSessionFinishedRef.current?.(data.branch);
        } else if (data.type === "session:taskCompleted") {
          onSessionTaskCompletedRef.current?.(data.branch, {
            duration_ms: data.duration_ms,
            cost_usd: data.cost_usd,
            input_tokens: data.input_tokens,
            output_tokens: data.output_tokens,
          });
        } else if (
          data.type === "task:created" ||
          data.type === "task:updated" ||
          data.type === "task:deleted"
        ) {
          onTaskChangedRef.current?.();
        }
      } catch {
        // Ignore parse errors (e.g. keepalive comments)
      }
    };

    return () => {
      es.close();
    };
  }, [projectId]);
}
