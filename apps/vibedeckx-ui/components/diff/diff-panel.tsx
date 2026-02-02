'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RefreshCw, GitBranch, GitMerge } from 'lucide-react';
import { FileDiff } from './file-diff';
import { useDiff } from '@/hooks/use-diff';

interface DiffPanelProps {
  projectId: string | null;
  selectedWorktree?: string;
  onMergeRequest?: () => void;
}

export function DiffPanel({ projectId, selectedWorktree, onMergeRequest }: DiffPanelProps) {
  const { diff, loading, error, refresh } = useDiff(projectId, selectedWorktree);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!projectId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Select a project to view changes</p>
        </div>
      </div>
    );
  }

  const fileCount = diff?.files.length ?? 0;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b h-14">
        <div className="flex items-center gap-4">
          <h2 className="font-semibold">Uncommitted Changes</h2>
          {fileCount > 0 && (
            <span className="text-sm text-muted-foreground">
              {fileCount} file{fileCount !== 1 ? 's' : ''} changed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onMergeRequest} disabled={loading || fileCount === 0}>
            <GitMerge className="h-4 w-4 mr-1" />
            Merge
          </Button>
          <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 overflow-hidden">
        <div className="p-4 space-y-4">
          {loading && !diff ? (
            <div className="text-center text-muted-foreground py-8">
              Loading changes...
            </div>
          ) : error ? (
            <div className="text-center text-red-400 py-8">
              {error}
            </div>
          ) : fileCount === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <p>No uncommitted changes</p>
              <p className="text-sm mt-1">
                All changes have been committed
              </p>
            </div>
          ) : (
            diff?.files.map((file, index) => (
              <FileDiff key={index} file={file} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
