"use client";

import { useState, useEffect, useCallback } from "react";
import { api, type ProjectRemote } from "@/lib/api";

export function useProjectRemotes(projectId: string | undefined) {
  const [remotes, setRemotes] = useState<ProjectRemote[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setRemotes([]);
      return;
    }
    setLoading(true);
    try {
      const data = await api.getProjectRemotes(projectId);
      setRemotes(data);
    } catch (err) {
      console.error("Failed to fetch project remotes:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { remotes, loading, refresh };
}
