"use client";

import type { Task } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { statusConfig, priorityConfig } from "./task-utils";

interface TaskDetailDialogProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskDetailDialog({ task, open, onOpenChange }: TaskDetailDialogProps) {
  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base leading-snug">{task.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-xs ${statusConfig[task.status].color}`}>
              {statusConfig[task.status].label}
            </Badge>
            <Badge variant="outline" className={`text-xs ${priorityConfig[task.priority].color}`}>
              {priorityConfig[task.priority].label}
            </Badge>
          </div>
          {task.description && (
            <p className="text-sm text-foreground whitespace-pre-wrap">{task.description}</p>
          )}
          <div className="flex gap-4 text-xs text-muted-foreground pt-2 border-t">
            <span>Created: {new Date(task.created_at).toLocaleString()}</span>
            <span>Updated: {new Date(task.updated_at).toLocaleString()}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
