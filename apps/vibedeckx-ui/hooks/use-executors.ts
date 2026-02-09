"use client";

import { useState, useEffect, useCallback } from "react";
import { api, type Executor, type ExecutorProcess } from "@/lib/api";

export interface ExecutorWithProcess extends Executor {
  currentProcessId: string | null;
  isRunning: boolean;
}

export function useExecutors(projectId: string | null, groupId: string | null | undefined) {
  const [executors, setExecutors] = useState<Executor[]>([]);
  const [runningProcesses, setRunningProcesses] = useState<Map<string, string>>(
    new Map()
  ); // executorId -> processId
  const [loading, setLoading] = useState(true);

  // Fetch executors scoped to group
  const fetchExecutors = useCallback(async () => {
    if (!projectId || !groupId) {
      setExecutors([]);
      setLoading(false);
      return;
    }

    try {
      const data = await api.getExecutors(projectId, groupId);
      setExecutors(data);
    } catch (error) {
      console.error("Failed to fetch executors:", error);
    } finally {
      setLoading(false);
    }
  }, [projectId, groupId]);

  // Fetch running processes
  const fetchRunningProcesses = useCallback(async () => {
    try {
      const processes = await api.getRunningProcesses();
      const processMap = new Map<string, string>();
      for (const proc of processes) {
        processMap.set(proc.executor_id, proc.id);
      }
      setRunningProcesses(processMap);
    } catch (error) {
      console.error("Failed to fetch running processes:", error);
    }
  }, []);

  useEffect(() => {
    fetchExecutors();
    fetchRunningProcesses();
  }, [fetchExecutors, fetchRunningProcesses]);

  // Create executor in the active group
  const createExecutor = useCallback(
    async (opts: { name: string; command: string; cwd?: string; pty?: boolean }) => {
      if (!projectId || !groupId) return null;

      try {
        const executor = await api.createExecutor(projectId, { ...opts, group_id: groupId });
        setExecutors((prev) => [...prev, executor]);
        return executor;
      } catch (error) {
        console.error("Failed to create executor:", error);
        return null;
      }
    },
    [projectId, groupId]
  );

  // Update executor
  const updateExecutor = useCallback(
    async (
      id: string,
      opts: { name?: string; command?: string; cwd?: string | null; pty?: boolean }
    ) => {
      try {
        const executor = await api.updateExecutor(id, opts);
        setExecutors((prev) =>
          prev.map((e) => (e.id === id ? executor : e))
        );
        return executor;
      } catch (error) {
        console.error("Failed to update executor:", error);
        return null;
      }
    },
    []
  );

  // Delete executor
  const deleteExecutor = useCallback(async (id: string) => {
    try {
      await api.deleteExecutor(id);
      setExecutors((prev) => prev.filter((e) => e.id !== id));
    } catch (error) {
      console.error("Failed to delete executor:", error);
    }
  }, []);

  // Start executor
  const startExecutor = useCallback(async (executorId: string, branch?: string | null) => {
    try {
      const processId = await api.startExecutor(executorId, branch);
      setRunningProcesses((prev) => {
        const newMap = new Map(prev);
        newMap.set(executorId, processId);
        return newMap;
      });
      return processId;
    } catch (error) {
      console.error("Failed to start executor:", error);
      return null;
    }
  }, []);

  // Stop executor
  const stopExecutor = useCallback(async (executorId: string, processId?: string) => {
    const targetProcessId = processId || runningProcesses.get(executorId);
    if (!targetProcessId) return;

    try {
      await api.stopProcess(targetProcessId);
      setRunningProcesses((prev) => {
        const newMap = new Map(prev);
        newMap.delete(executorId);
        return newMap;
      });
    } catch (error) {
      console.error("Failed to stop executor:", error);
    }
  }, [runningProcesses]);

  // Mark process as finished (called when WebSocket receives finished message)
  const markProcessFinished = useCallback((executorId: string) => {
    setRunningProcesses((prev) => {
      const newMap = new Map(prev);
      newMap.delete(executorId);
      return newMap;
    });
  }, []);

  // Reorder executors with optimistic update
  const reorderExecutors = useCallback(
    async (orderedIds: string[]) => {
      if (!projectId || !groupId) return;

      // Optimistic update: reorder local state immediately
      const previousExecutors = executors;
      const reorderedExecutors = orderedIds
        .map((id) => executors.find((e) => e.id === id))
        .filter((e): e is Executor => e !== undefined);
      setExecutors(reorderedExecutors);

      try {
        await api.reorderExecutors(projectId, orderedIds, groupId);
      } catch (error) {
        // Revert on error
        console.error("Failed to reorder executors:", error);
        setExecutors(previousExecutors);
      }
    },
    [projectId, groupId, executors]
  );

  // Get executor with process info
  const executorsWithProcess: ExecutorWithProcess[] = executors.map((executor) => ({
    ...executor,
    currentProcessId: runningProcesses.get(executor.id) ?? null,
    isRunning: runningProcesses.has(executor.id),
  }));

  return {
    executors: executorsWithProcess,
    loading,
    createExecutor,
    updateExecutor,
    deleteExecutor,
    startExecutor,
    stopExecutor,
    markProcessFinished,
    reorderExecutors,
    refetch: fetchExecutors,
  };
}
