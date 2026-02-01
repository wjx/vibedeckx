import { Badge } from '@/components/ui/badge';
import { DiffLine } from './diff-line';
import type { FileDiff as FileDiffType } from '@/lib/api';

interface FileDiffProps {
  file: FileDiffType;
}

const statusColors = {
  modified: 'bg-yellow-500/20 text-yellow-500',
  added: 'bg-green-500/20 text-green-500',
  deleted: 'bg-red-500/20 text-red-500',
  renamed: 'bg-blue-500/20 text-blue-500',
};

const statusLabels = {
  modified: 'Modified',
  added: 'Added',
  deleted: 'Deleted',
  renamed: 'Renamed',
};

export function FileDiff({ file }: FileDiffProps) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 bg-muted border-b">
        <span className="font-mono text-sm flex-1">
          {file.oldPath && file.status === 'renamed' ? (
            <>
              <span className="text-muted-foreground">{file.oldPath}</span>
              <span className="mx-2">→</span>
              {file.path}
            </>
          ) : (
            file.path
          )}
        </span>
        <Badge variant="secondary" className={statusColors[file.status]}>
          {statusLabels[file.status]}
        </Badge>
      </div>
      <div className="overflow-x-auto">
        {file.hunks.map((hunk, hunkIndex) => (
          <div key={hunkIndex}>
            <div className="px-4 py-1 bg-muted/50 text-muted-foreground text-sm font-mono">
              @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
            </div>
            {hunk.lines.map((line, lineIndex) => (
              <DiffLine key={lineIndex} line={line} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
