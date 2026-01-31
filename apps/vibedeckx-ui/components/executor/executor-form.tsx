"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Executor } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ExecutorFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  executor?: Executor;
  onSubmit: (data: { name: string; command: string; cwd?: string; pty?: boolean }) => Promise<void>;
}

export function ExecutorForm({
  open,
  onOpenChange,
  executor,
  onSubmit,
}: ExecutorFormProps) {
  const [name, setName] = useState(executor?.name ?? "");
  const [command, setCommand] = useState(executor?.command ?? "");
  const [cwd, setCwd] = useState(executor?.cwd ?? "");
  const [pty, setPty] = useState(executor?.pty ?? true);
  const [loading, setLoading] = useState(false);

  const isEdit = !!executor;

  // Reset form when executor changes
  useEffect(() => {
    if (executor) {
      setName(executor.name);
      setCommand(executor.command);
      setCwd(executor.cwd ?? "");
      setPty(executor.pty);
    }
  }, [executor]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !command.trim()) return;

    setLoading(true);
    try {
      await onSubmit({
        name: name.trim(),
        command: command.trim(),
        cwd: cwd.trim() || undefined,
        pty,
      });
      onOpenChange(false);
      if (!isEdit) {
        setName("");
        setCommand("");
        setCwd("");
        setPty(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Executor" : "Add Executor"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              placeholder="e.g., Dev Server"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Command</label>
            <Input
              placeholder="e.g., npm run dev"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Working Directory{" "}
              <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              placeholder="Leave empty to use project path"
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">Terminal Mode (PTY)</label>
              <p className="text-xs text-muted-foreground">
                Enable for interactive commands like top, vim, htop
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={pty}
              onClick={() => setPty(!pty)}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                pty ? "bg-primary" : "bg-input"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition-transform",
                  pty ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim() || !command.trim()}>
              {loading ? "Saving..." : isEdit ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
