"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Plus, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export interface ExecutionModeTarget {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface ExecutionModeToggleProps {
  targets: ExecutionModeTarget[];
  activeTarget: string;
  onTargetChange: (targetId: string) => void;
  onAddRemote?: () => void;
  disabled?: boolean;
}

const MAX_VISIBLE = 4;
const OVERFLOW_VISIBLE = 3;

export function ExecutionModeToggle({
  targets,
  activeTarget,
  onTargetChange,
  onAddRemote,
  disabled,
}: ExecutionModeToggleProps) {
  const hasOverflow = targets.length > MAX_VISIBLE;
  const visibleTargets = hasOverflow
    ? targets.slice(0, OVERFLOW_VISIBLE)
    : targets;
  const overflowTargets = hasOverflow
    ? targets.slice(OVERFLOW_VISIBLE)
    : [];

  const isActiveInOverflow = overflowTargets.some(
    (t) => t.id === activeTarget
  );

  return (
    <div className="inline-flex items-center rounded-md border bg-muted/50 p-0.5 text-xs">
      {visibleTargets.map((target) => {
        const Icon = target.icon;
        return (
          <button
            key={target.id}
            onClick={() => onTargetChange(target.id)}
            disabled={disabled}
            className={cn(
              "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 transition-colors",
              activeTarget === target.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            {Icon && <Icon className="h-3 w-3" />}
            {target.label}
          </button>
        );
      })}

      {hasOverflow && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              disabled={disabled}
              className={cn(
                "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 transition-colors",
                isActiveInOverflow
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              <MoreHorizontal className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {overflowTargets.map((target) => {
              const Icon = target.icon;
              return (
                <DropdownMenuItem
                  key={target.id}
                  onClick={() => onTargetChange(target.id)}
                  className={cn(
                    "text-xs",
                    activeTarget === target.id && "font-medium"
                  )}
                >
                  {Icon && <Icon className="h-3 w-3" />}
                  {target.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {onAddRemote && (
        <button
          onClick={onAddRemote}
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 transition-colors text-muted-foreground hover:text-foreground",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <Plus className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
