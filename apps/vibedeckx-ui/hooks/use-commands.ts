"use client";

import { useState, useEffect, useCallback } from "react";
import { api, type Command } from "@/lib/api";

export function useCommands(projectId: string | null, branch: string | null) {
  const [commands, setCommands] = useState<Command[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCommands = useCallback(async () => {
    if (!projectId) {
      setCommands([]);
      setLoading(false);
      return;
    }

    try {
      const data = await api.getCommands(projectId, branch);
      setCommands(data);
    } catch (error) {
      console.error("Failed to fetch commands:", error);
    } finally {
      setLoading(false);
    }
  }, [projectId, branch]);

  useEffect(() => {
    fetchCommands();
  }, [fetchCommands]);

  const createCommand = useCallback(
    async (opts: { name: string; content: string }) => {
      if (!projectId) return null;

      try {
        const command = await api.createCommand(projectId, { ...opts, branch });
        setCommands((prev) => [...prev, command]);
        return command;
      } catch (error) {
        console.error("Failed to create command:", error);
        return null;
      }
    },
    [projectId, branch]
  );

  const updateCommand = useCallback(
    async (id: string, opts: { name?: string; content?: string }) => {
      const previousCommands = commands;
      setCommands((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...opts, updated_at: new Date().toISOString() } : c))
      );

      try {
        const command = await api.updateCommand(id, opts);
        setCommands((prev) => prev.map((c) => (c.id === id ? command : c)));
        return command;
      } catch (error) {
        console.error("Failed to update command:", error);
        setCommands(previousCommands);
        return null;
      }
    },
    [commands]
  );

  const deleteCommand = useCallback(async (id: string) => {
    const previousCommands = commands;
    setCommands((prev) => prev.filter((c) => c.id !== id));

    try {
      await api.deleteCommand(id);
    } catch (error) {
      console.error("Failed to delete command:", error);
      setCommands(previousCommands);
    }
  }, [commands]);

  return {
    commands,
    loading,
    createCommand,
    updateCommand,
    deleteCommand,
    refetch: fetchCommands,
  };
}
