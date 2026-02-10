"use client";

import { Badge } from "@/components/ui/badge";

interface BashInput {
  command: string;
  description?: string;
  timeout?: number;
}

function parseBashInput(input: unknown): BashInput | null {
  try {
    const obj = (typeof input === "string" ? JSON.parse(input) : input) as Record<string, unknown>;
    if (obj && typeof obj === "object" && typeof obj.command === "string") {
      return obj as unknown as BashInput;
    }
    return null;
  } catch {
    return null;
  }
}

function formatTimeout(ms: number): string {
  if (ms >= 60000) {
    const mins = ms / 60000;
    return `${mins % 1 === 0 ? mins : mins.toFixed(1)}m`;
  }
  return `${ms / 1000}s`;
}

export function BashToolUseUI({ input }: { input: unknown }) {
  const parsed = parseBashInput(input);
  if (!parsed) {
    return (
      <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto max-w-full whitespace-pre-wrap break-all">
        {typeof input === "string" ? input : JSON.stringify(input, null, 2)}
      </pre>
    );
  }

  const { command, description, timeout } = parsed;

  return (
    <div className="space-y-1">
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      <div className="flex items-start gap-2">
        <pre className="flex-1 min-w-0 text-xs bg-muted/50 p-2 rounded overflow-x-auto max-w-full whitespace-pre-wrap break-all">
          <span className="text-muted-foreground select-none">$ </span>{command}
        </pre>
        {timeout != null && (
          <Badge variant="outline" className="text-xs shrink-0 mt-1">
            {formatTimeout(timeout)}
          </Badge>
        )}
      </div>
    </div>
  );
}

export function BashToolResultUI({ output }: { output: string }) {
  if (!output || output.trim() === "") {
    return (
      <p className="text-xs text-muted-foreground italic">No output</p>
    );
  }

  const lineCount = output.split("\n").length;

  return (
    <details>
      <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
        Output ({lineCount} {lineCount === 1 ? "line" : "lines"})
      </summary>
      <pre className="mt-1 text-xs bg-muted/50 p-2 rounded overflow-x-auto max-h-48 overflow-y-auto max-w-full whitespace-pre-wrap break-all">
        {output.length > 1000 ? output.substring(0, 1000) + "..." : output}
      </pre>
    </details>
  );
}
