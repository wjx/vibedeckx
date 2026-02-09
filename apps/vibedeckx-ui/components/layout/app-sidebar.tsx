"use client";

import { Columns3, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActiveView = "workspace" | "tasks";

interface AppSidebarProps {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
}

const navItems: { view: ActiveView; icon: typeof ListTodo; label: string }[] = [
  { view: "tasks", icon: ListTodo, label: "Tasks" },
  { view: "workspace", icon: Columns3, label: "Workspace" },
];

export function AppSidebar({ activeView, onViewChange }: AppSidebarProps) {
  return (
    <nav className="w-40 border-r bg-muted/40 flex flex-col gap-1 p-2">
      {navItems.map(({ view, icon: Icon, label }) => (
        <button
          key={view}
          onClick={() => onViewChange(view)}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            "hover:bg-accent hover:text-accent-foreground",
            activeView === view && "bg-accent text-accent-foreground"
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
