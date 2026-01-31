"use client";

import { useState } from "react";
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

interface ExecutorFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  executor?: Executor;
  onSubmit: (data: { name: string; command: string; cwd?: string }) => Promise<void>;
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
  const [loading, setLoading] = useState(false);

  const isEdit = !!executor;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !command.trim()) return;

    setLoading(true);
    try {
      await onSubmit({
        name: name.trim(),
        command: command.trim(),
        cwd: cwd.trim() || undefined,
      });
      onOpenChange(false);
      if (!isEdit) {
        setName("");
        setCommand("");
        setCwd("");
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
