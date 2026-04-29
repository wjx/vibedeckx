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

type TaskChangedEvent = {
  type: "task:created" | "task:updated" | "task:deleted";
  projectId: string;
};

type GlobalEvent = TaskChangedEvent | { type: string; projectId?: string };

interface UseGlobalEventsOptions {
  onTaskChanged?: () => void;
}

/**
 * Subscribes to backend SSE for task-table refreshes. Workspace dot status
 * lives in `useBranchActivity`; legacy session:* events still flow on the
 * wire (ChatSessionManager consumes them server-side) but aren't read here.
 */
export function useGlobalEvents(
  projectId: string | null,
  options: UseGlobalEventsOptions
) {
  const onTaskChangedRef = useRef(options.onTaskChanged);

  useEffect(() => {
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

        if (
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
