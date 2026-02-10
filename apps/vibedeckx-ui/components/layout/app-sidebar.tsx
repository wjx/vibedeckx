"use client";

import { Columns3, ListTodo, GitBranch, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Worktree, Project } from "@/lib/api";

export type ActiveView = "workspace" | "tasks";

interface AppSidebarProps {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  worktrees?: Worktree[];
  selectedBranch?: string | null;
  onBranchChange?: (branch: string | null) => void;
  currentProject?: Project | null;
  onCreateWorktreeOpen?: () => void;
}

export function AppSidebar({
  activeView,
  onViewChange,
  worktrees,
  selectedBranch,
  onBranchChange,
  currentProject,
  onCreateWorktreeOpen,
}: AppSidebarProps) {
  return (
    <nav className="w-40 border-r bg-muted/40 flex flex-col gap-1 p-2">
      {/* Tasks */}
      <button
        onClick={() => onViewChange("tasks")}
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          activeView === "tasks" && "bg-accent text-accent-foreground"
        )}
      >
        <ListTodo className="h-4 w-4 shrink-0" />
        <span>Tasks</span>
      </button>

      {/* Workspace + create button */}
      <div className="flex items-center">
        <button
          onClick={() => onViewChange("workspace")}
          className={cn(
            "flex-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            activeView === "workspace" && "bg-accent text-accent-foreground"
          )}
        >
          <Columns3 className="h-4 w-4 shrink-0" />
          <span>Workspace</span>
        </button>
        {currentProject && (
          <button
            onClick={onCreateWorktreeOpen}
            className="p-1 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
            title="Create new worktree"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Worktree sub-items */}
      {worktrees && worktrees.length > 0 && (
        <div className="flex flex-col gap-0.5">
          {worktrees.map((wt) => (
            <button
              key={wt.branch ?? "__main__"}
              onClick={() => {
                onBranchChange?.(wt.branch);
                onViewChange("workspace");
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-md pl-7 pr-2 py-1.5 text-xs transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                selectedBranch === wt.branch && "bg-accent text-accent-foreground"
              )}
              title={wt.branch ?? "main"}
            >
              <GitBranch className="h-3 w-3 shrink-0" />
              <span className="truncate">{wt.branch ?? "main"}</span>
            </button>
          ))}
        </div>
      )}
    </nav>
  );
}
