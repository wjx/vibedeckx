"use client";

import { useState, useEffect, useCallback } from "react";
import { api, type TerminalSession } from "@/lib/api";

export interface UseTerminalsResult {
  terminals: TerminalSession[];
  activeTerminalId: string | null;
  createTerminal: () => Promise<void>;
  closeTerminal: (id: string) => Promise<void>;
  setActiveTerminal: (id: string) => void;
  removeTerminal: (id: string) => void;
}

export function useTerminals(
  projectId: string | null,
  branch?: string | null
): UseTerminalsResult {
  const [terminals, setTerminals] = useState<TerminalSession[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);

  // Fetch existing terminals when projectId changes
  useEffect(() => {
    if (!projectId) {
      setTerminals([]);
      setActiveTerminalId(null);
      return;
    }

    api.getTerminals(projectId).then((list) => {
      setTerminals(list);
      if (list.length > 0 && !activeTerminalId) {
        setActiveTerminalId(list[0].id);
      }
    });
  }, [projectId]);

  const createTerminal = useCallback(async () => {
    if (!projectId) return;
    const terminal = await api.createTerminal(projectId, branch);
    setTerminals((prev) => [...prev, terminal]);
    setActiveTerminalId(terminal.id);
  }, [projectId, branch]);

  const closeTerminal = useCallback(async (id: string) => {
    await api.closeTerminal(id);
    setTerminals((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeTerminalId === id) {
        setActiveTerminalId(next.length > 0 ? next[next.length - 1].id : null);
      }
      return next;
    });
  }, [activeTerminalId]);

  const setActiveTerminal = useCallback((id: string) => {
    setActiveTerminalId(id);
  }, []);

  // Remove a terminal from the list (called when shell exits on its own)
  const removeTerminal = useCallback((id: string) => {
    setTerminals((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeTerminalId === id) {
        setActiveTerminalId(next.length > 0 ? next[next.length - 1].id : null);
      }
      return next;
    });
  }, [activeTerminalId]);

  return {
    terminals,
    activeTerminalId,
    createTerminal,
    closeTerminal,
    setActiveTerminal,
    removeTerminal,
  };
}
