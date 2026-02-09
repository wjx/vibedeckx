"use client";

import { useState } from "react";
import { useTasks } from "@/hooks/use-tasks";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { TaskTable } from "./task-table";
import { TaskForm } from "./task-form";

interface TasksViewProps {
  projectId: string | null;
}

export function TasksView({ projectId }: TasksViewProps) {
  const { tasks, loading, createTask, updateTask, deleteTask } = useTasks(projectId);
  const [formOpen, setFormOpen] = useState(false);

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
          <TaskTable tasks={tasks} onUpdate={updateTask} onDelete={deleteTask} />
        )}
      </div>

      <TaskForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={createTask}
      />
    </div>
  );
}
