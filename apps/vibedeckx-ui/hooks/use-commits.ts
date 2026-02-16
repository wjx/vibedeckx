'use client';

import { useState, useCallback } from 'react';
import { api, type CommitEntry } from '@/lib/api';

export function useCommits(projectId: string | null, branch?: string | null, limit?: number) {
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!projectId) {
      setCommits([]);
      return;
    }

    setLoading(true);
    try {
      const result = await api.getCommits(projectId, branch, limit);
      setCommits(result);
    } catch {
      setCommits([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, branch, limit]);

  return {
    commits,
    loading,
    refetch,
  };
}
