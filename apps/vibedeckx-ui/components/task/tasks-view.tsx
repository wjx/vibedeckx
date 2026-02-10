"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { TaskTable } from "./task-table";
import { TaskForm } from "./task-form";
import type { Task, TaskStatus, TaskPriority, Worktree } from "@/lib/api";

interface TasksViewProps {
  projectId: string | null;
  tasks: Task[];
  loading: boolean;
  worktrees: Worktree[];
  onCreateTask: (opts: { title?: string; description: string; status?: TaskStatus; priority?: TaskPriority }) => Promise<Task | null>;
  onUpdateTask: (id: string, opts: { title?: string; description?: string | null; status?: TaskStatus; priority?: TaskPriority; assigned_branch?: string | null }) => Promise<Task | null>;
  onDeleteTask: (id: string) => Promise<void>;
}

export function TasksView({ projectId, tasks, loading, worktrees, onCreateTask, onUpdateTask, onDeleteTask }: TasksViewProps) {
  const [formOpen, setFormOpen] = useState(false);

  const handleAssign = (taskId: string, branch: string | null) => {
    onUpdateTask(taskId, { assigned_branch: branch });
  };

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Select a project to view tasks.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0">
        <h2 className="text-sm font-semibold">Tasks</h2>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Task
        </Button>
      </div>

      <div className="flex-1 overflow-auto px-4">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            Loading tasks...
          </div>
        ) : (
          <TaskTable
            tasks={tasks}
            onUpdate={onUpdateTask}
            onDelete={onDeleteTask}
            worktrees={worktrees}
            onAssign={handleAssign}
          />
        )}
      </div>

      <TaskForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={onCreateTask}
      />
    </div>
  );
}
