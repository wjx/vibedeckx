import { cn } from '@/lib/utils';
import type { DiffLine as DiffLineType } from '@/lib/api';

interface DiffLineProps {
  line: DiffLineType;
}

export function DiffLine({ line }: DiffLineProps) {
  const prefix = line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' ';

  return (
    <div
      className={cn(
        'flex font-mono text-sm',
        line.type === 'add' && 'bg-green-900/30 text-green-400',
        line.type === 'delete' && 'bg-red-900/30 text-red-400'
      )}
    >
      <span className="w-12 flex-shrink-0 text-right pr-2 text-muted-foreground select-none border-r border-border">
        {line.oldLineNo ?? ''}
      </span>
      <span className="w-12 flex-shrink-0 text-right pr-2 text-muted-foreground select-none border-r border-border">
        {line.newLineNo ?? ''}
      </span>
      <span className="w-6 flex-shrink-0 text-center select-none">
        {prefix}
      </span>
      <span className="whitespace-pre-wrap break-all pr-4 flex-1 min-w-0">{line.content}</span>
    </div>
  );
}
