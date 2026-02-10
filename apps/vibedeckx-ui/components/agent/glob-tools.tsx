"use client";

import { Badge } from "@/components/ui/badge";

interface GlobInput {
  pattern: string;
  path?: string;
}

function parseGlobInput(input: unknown): GlobInput | null {
  try {
    const obj = (typeof input === "string" ? JSON.parse(input) : input) as Record<string, unknown>;
    if (obj && typeof obj === "object" && typeof obj.pattern === "string") {
      return obj as unknown as GlobInput;
    }
    return null;
  } catch {
    return null;
  }
}

export function GlobToolUseUI({ input }: { input: unknown }) {
  const parsed = parseGlobInput(input);
  if (!parsed) {
    return (
      <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto max-w-full whitespace-pre-wrap break-all">
        {typeof input === "string" ? input : JSON.stringify(input, null, 2)}
      </pre>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-start gap-2">
        <pre className="flex-1 min-w-0 text-xs bg-muted/50 p-2 rounded overflow-x-auto max-w-full whitespace-pre-wrap break-all">
          {parsed.pattern}
        </pre>
      </div>
      {parsed.path && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-xs">
            {parsed.path}
          </Badge>
        </div>
      )}
    </div>
  );
}

export function GlobToolResultUI({ output }: { output: string }) {
  if (!output || output.trim() === "") {
    return (
      <p className="text-xs text-muted-foreground italic">No matches</p>
    );
  }

  const files = output.trim().split("\n");
  const fileCount = files.length;

  return (
    <details>
      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
        {fileCount} {fileCount === 1 ? "file" : "files"} found
      </summary>
      <pre className="mt-1 text-xs bg-muted/50 p-2 rounded overflow-x-auto max-h-48 overflow-y-auto max-w-full whitespace-pre-wrap break-all">
        {output.length > 1000 ? output.substring(0, 1000) + "..." : output}
      </pre>
    </details>
  );
}
