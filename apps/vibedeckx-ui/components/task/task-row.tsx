"use client";

import { useState, useRef, useEffect } from "react";
import type { Task, TaskStatus, TaskPriority } from "@/lib/api";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Trash2 } from "lucide-react";
import { statusConfig, priorityConfig, statusOptions, priorityOptions } from "./task-utils";

interface TaskRowProps {
  task: Task;
  onUpdate: (id: string, opts: { title?: string; status?: TaskStatus; priority?: TaskPriority }) => void;
  onDelete: (id: string) => void;
}

export function TaskRow({ task, onUpdate, onDelete }: TaskRowProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingTitle) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingTitle]);

  useEffect(() => {
    setTitleValue(task.title);
  }, [task.title]);

  const commitTitle = () => {
    setEditingTitle(false);
    const trimmed = titleValue.trim();
    if (trimmed && trimmed !== task.title) {
      onUpdate(task.id, { title: trimmed });
    } else {
      setTitleValue(task.title);
    }
  };

  const isDone = task.status === "done" || task.status === "cancelled";

  return (
    <TableRow className="group">
      <TableCell className="w-10">
        <Checkbox
          checked={task.status === "done"}
          onCheckedChange={(checked) => {
            onUpdate(task.id, { status: checked ? "done" : "todo" });
          }}
        />
      </TableCell>
      <TableCell className="font-medium">
        {editingTitle ? (
          <input
            ref={inputRef}
            className="w-full bg-transparent border-b border-primary outline-none text-sm py-0.5"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
              if (e.key === "Escape") {
                setTitleValue(task.title);
                setEditingTitle(false);
              }
            }}
          />
        ) : (
          <span
            className={`cursor-pointer hover:underline text-sm ${isDone ? "line-through text-muted-foreground" : ""}`}
            onClick={() => setEditingTitle(true)}
          >
            {task.title}
          </span>
        )}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="focus:outline-none">
              <Badge variant="outline" className={`cursor-pointer text-xs ${statusConfig[task.status].color}`}>
                {statusConfig[task.status].label}
              </Badge>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {statusOptions.map((s) => (
              <DropdownMenuItem key={s} onClick={() => onUpdate(task.id, { status: s })}>
                <span className={`inline-block w-2 h-2 rounded-full mr-2 ${statusConfig[s].color}`} />
                {statusConfig[s].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="focus:outline-none">
              <Badge variant="outline" className={`cursor-pointer text-xs ${priorityConfig[task.priority].color}`}>
                {priorityConfig[task.priority].label}
              </Badge>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {priorityOptions.map((p) => (
              <DropdownMenuItem key={p} onClick={() => onUpdate(task.id, { priority: p })}>
                <span className={`inline-block w-2 h-2 rounded-full mr-2 ${priorityConfig[p].color}`} />
                {priorityConfig[p].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
      <TableCell className="text-muted-foreground text-xs">
        {new Date(task.created_at).toLocaleDateString()}
      </TableCell>
      <TableCell className="w-10">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onDelete(task.id)}
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
