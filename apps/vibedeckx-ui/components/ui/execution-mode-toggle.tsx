"use client";

import { cn } from "@/lib/utils";
import { Monitor, Cloud } from "lucide-react";

interface ExecutionModeToggleProps {
  mode: "local" | "remote";
  onModeChange: (mode: "local" | "remote") => void;
  disabled?: boolean;
}

export function ExecutionModeToggle({
  mode,
  onModeChange,
  disabled,
}: ExecutionModeToggleProps) {
  return (
    <div className="inline-flex items-center rounded-md border bg-muted/50 p-0.5 text-xs">
      <button
        onClick={() => onModeChange("local")}
        disabled={disabled}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 transition-colors",
          mode === "local"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <Monitor className="h-3 w-3" />
        Local
      </button>
      <button
        onClick={() => onModeChange("remote")}
        disabled={disabled}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 transition-colors",
          mode === "remote"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <Cloud className="h-3 w-3" />
        Remote
      </button>
    </div>
  );
}
