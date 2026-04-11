"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Plus, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
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

export function ExecutionModeToggle({
  targets,
  activeTarget,
  onTargetChange,
  onAddRemote,
  disabled,
}: ExecutionModeToggleProps) {
  const active = targets.find((t) => t.id === activeTarget) ?? targets[0];
  const ActiveIcon = active?.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-0.5 text-xs font-medium transition-colors hover:bg-muted",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          {ActiveIcon && <ActiveIcon className="h-3 w-3" />}
          {active?.label ?? "Local"}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={activeTarget}
          onValueChange={onTargetChange}
        >
          {targets.map((target) => {
            const Icon = target.icon;
            return (
              <DropdownMenuRadioItem key={target.id} value={target.id} className="text-xs">
                {Icon && <Icon className="h-3 w-3" />}
                {target.label}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
        {onAddRemote && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onAddRemote} className="text-xs">
              <Plus className="h-3 w-3" />
              Add Remote
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
