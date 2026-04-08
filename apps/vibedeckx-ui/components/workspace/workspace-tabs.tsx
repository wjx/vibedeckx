"use client";

import { useState } from "react";
import { RulesList } from "@/components/rules/rules-list";
import type { Rule, Task } from "@/lib/api";

type Tab = "task" | "rules";

interface WorkspaceTabsProps {
  assignedTask: Task | null;
  rules: Rule[];
  onCreateRule: (opts: { name: string; content: string; enabled?: boolean }) => Promise<Rule | null>;
  onUpdateRule: (id: string, opts: { name?: string; content?: string; enabled?: boolean }) => Promise<Rule | null>;
  onDeleteRule: (id: string) => Promise<void>;
}

export function WorkspaceTabs({
  assignedTask,
  rules,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
}: WorkspaceTabsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("task");

  return (
    <div className="space-y-2">
      {/* Tab bar */}
      <div className="flex gap-4">
        <button
          onClick={() => setActiveTab("task")}
          className={`text-xs font-medium uppercase tracking-wider pb-1 border-b-2 transition-colors ${
            activeTab === "task"
              ? "text-foreground border-foreground"
              : "text-muted-foreground border-transparent hover:text-foreground/70"
          }`}
        >
          Task
        </button>
        <button
          onClick={() => setActiveTab("rules")}
          className={`text-xs font-medium uppercase tracking-wider pb-1 border-b-2 transition-colors ${
            activeTab === "rules"
              ? "text-foreground border-foreground"
              : "text-muted-foreground border-transparent hover:text-foreground/70"
          }`}
        >
          Rules
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "task" ? (
        <div>
          {assignedTask ? (
            <p className="text-sm text-foreground truncate" title={assignedTask.title}>
              {assignedTask.title}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground py-3 text-center">
              No task assigned to this workspace.
            </p>
          )}
        </div>
      ) : (
        <RulesList
          rules={rules}
          onCreateRule={onCreateRule}
          onUpdateRule={onUpdateRule}
          onDeleteRule={onDeleteRule}
        />
      )}
    </div>
  );
}
