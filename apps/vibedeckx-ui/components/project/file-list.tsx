import { Folder, File } from "lucide-react";
import type { DirectoryEntry } from "@/lib/api";

interface FileListProps {
  files: DirectoryEntry[];
}

export function FileList({ files }: FileListProps) {
  if (files.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic">
        No files found
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {files.map((entry) => (
        <div
          key={entry.name}
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          {entry.type === "directory" ? (
            <Folder className="h-4 w-4 text-blue-500" />
          ) : (
            <File className="h-4 w-4" />
          )}
          <span className="truncate">{entry.name}</span>
        </div>
      ))}
    </div>
  );
}
