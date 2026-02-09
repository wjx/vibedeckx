"use client";

import { useState, useMemo } from "react";
import type { Task, TaskStatus, TaskPriority } from "@/lib/api";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TaskRow } from "./task-row";

type SortField = "title" | "status" | "priority" | "created_at";
type SortDir = "asc" | "desc";

const statusOrder: Record<TaskStatus, number> = { todo: 0, in_progress: 1, done: 2, cancelled: 3 };
const priorityOrder: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

interface TaskTableProps {
  tasks: Task[];
  onUpdate: (id: string, opts: { title?: string; status?: TaskStatus; priority?: TaskPriority }) => void;
  onDelete: (id: string) => void;
}

export function TaskTable({ tasks, onUpdate, onDelete }: TaskTableProps) {
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const sorted = useMemo(() => {
    if (!sortField) return tasks;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...tasks].sort((a, b) => {
      switch (sortField) {
        case "title":
          return dir * a.title.localeCompare(b.title);
        case "status":
          return dir * (statusOrder[a.status] - statusOrder[b.status]);
        case "priority":
          return dir * (priorityOrder[a.priority] - priorityOrder[b.priority]);
        case "created_at":
          return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        default:
          return 0;
      }
    });
  }, [tasks, sortField, sortDir]);

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? " \u2191" : " \u2193";
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10" />
          <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("title")}>
            Title{sortIndicator("title")}
          </TableHead>
          <TableHead className="cursor-pointer select-none w-32" onClick={() => toggleSort("status")}>
            Status{sortIndicator("status")}
          </TableHead>
          <TableHead className="cursor-pointer select-none w-28" onClick={() => toggleSort("priority")}>
            Priority{sortIndicator("priority")}
          </TableHead>
          <TableHead className="cursor-pointer select-none w-28" onClick={() => toggleSort("created_at")}>
            Created{sortIndicator("created_at")}
          </TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            onUpdate={onUpdate}
            onDelete={onDelete}
          />
        ))}
        {tasks.length === 0 && (
          <TableRow>
            <td colSpan={6} className="text-center text-muted-foreground py-8 text-sm">
              No tasks yet. Create one to get started.
            </td>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
