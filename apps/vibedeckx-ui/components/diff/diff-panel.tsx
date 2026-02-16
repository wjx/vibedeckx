'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RefreshCw, GitBranch, GitMerge } from 'lucide-react';
import { FileDiff } from './file-diff';
import { CommitSelector } from './commit-selector';
import { ExecutionModeToggle } from '@/components/ui/execution-mode-toggle';
import { useDiff } from '@/hooks/use-diff';
import { useCommits } from '@/hooks/use-commits';
import type { Project } from '@/lib/api';

interface DiffPanelProps {
  projectId: string | null;
  selectedBranch?: string | null;
  onMergeRequest?: () => void;
  project?: Project | null;
}

export function DiffPanel({ projectId, selectedBranch, onMergeRequest, project }: DiffPanelProps) {
  const [sinceCommit, setSinceCommit] = useState<string | null>(null);
  const [diffTarget, setDiffTarget] = useState<'local' | 'remote'>('local');
  const { diff, loading, error, refresh } = useDiff(projectId, selectedBranch, sinceCommit, diffTarget);
  const { commits, loading: commitsLoading, refetch: refetchCommits } = useCommits(projectId, selectedBranch, undefined, diffTarget);

  const isHybrid = !!(project?.path && project?.remote_path);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    refetchCommits();
  }, [refetchCommits]);

  // Reset sinceCommit when branch changes
  useEffect(() => {
    setSinceCommit(null);
  }, [selectedBranch]);

  // Reset diffTarget when project changes
  useEffect(() => {
    setDiffTarget('local');
  }, [projectId]);

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
          {fileCount > 0 && (
            <span className="text-sm text-muted-foreground">
              {fileCount} file{fileCount !== 1 ? 's' : ''} changed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isHybrid && (
            <ExecutionModeToggle
              mode={diffTarget}
              onModeChange={setDiffTarget}
              disabled={loading}
            />
          )}
          <span className="text-sm text-muted-foreground whitespace-nowrap">Changes since:</span>
          <CommitSelector
            commits={commits}
            selectedCommit={sinceCommit}
            onSelectCommit={setSinceCommit}
            loading={commitsLoading}
            disabled={loading}
          />
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
              <p>{sinceCommit ? 'No changes since this commit' : 'No changes'}</p>
              {sinceCommit && (
                <p className="text-sm mt-1">Try selecting an earlier commit</p>
              )}
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
