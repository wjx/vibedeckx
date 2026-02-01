'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Terminal, GitBranch } from 'lucide-react';
import { ExecutorPanel } from '@/components/executor';
import { DiffPanel } from '@/components/diff';

interface RightPanelProps {
  projectId: string | null;
  selectedWorktree?: string;
}

type TabType = 'executors' | 'diff';

export function RightPanel({ projectId, selectedWorktree }: RightPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('executors');

  return (
    <div className="h-full flex flex-col">
      {/* Tab Bar */}
      <div className="flex border-b h-14">
        <button
          onClick={() => setActiveTab('executors')}
          className={cn(
            'flex items-center gap-2 px-4 border-b-2 transition-colors',
            activeTab === 'executors'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <Terminal className="h-4 w-4" />
          Executors
        </button>
        <button
          onClick={() => setActiveTab('diff')}
          className={cn(
            'flex items-center gap-2 px-4 border-b-2 transition-colors',
            activeTab === 'diff'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          <GitBranch className="h-4 w-4" />
          Diff
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'executors' ? (
          <ExecutorPanel
            projectId={projectId}
            selectedWorktree={selectedWorktree}
          />
        ) : (
          <DiffPanel
            projectId={projectId}
            selectedWorktree={selectedWorktree}
          />
        )}
      </div>
    </div>
  );
}
