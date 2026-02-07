"use client";

import { cn } from "@/lib/utils";
import { ClipboardList, Pencil } from "lucide-react";

interface PermissionModeToggleProps {
  mode: "plan" | "edit";
  onModeChange: (mode: "plan" | "edit") => void;
  disabled?: boolean;
}

export function PermissionModeToggle({
  mode,
  onModeChange,
  disabled,
}: PermissionModeToggleProps) {
  return (
    <div className="inline-flex items-center rounded-md border bg-muted/50 p-0.5 text-xs">
      <button
        onClick={() => onModeChange("plan")}
        disabled={disabled}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 transition-colors",
          mode === "plan"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <ClipboardList className="h-3 w-3" />
        Plan
      </button>
      <button
        onClick={() => onModeChange("edit")}
        disabled={disabled}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 transition-colors",
          mode === "edit"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <Pencil className="h-3 w-3" />
        Edit
      </button>
    </div>
  );
}
