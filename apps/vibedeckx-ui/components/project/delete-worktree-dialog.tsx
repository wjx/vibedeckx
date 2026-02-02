"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api, type Worktree } from "@/lib/api";

interface DeleteWorktreeDialogProps {
  projectId: string;
  worktree: Worktree | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onWorktreeDeleted: () => void;
}

export function DeleteWorktreeDialog({
  projectId,
  worktree,
  open,
  onOpenChange,
  onWorktreeDeleted,
}: DeleteWorktreeDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!worktree) return;

    setLoading(true);
    setError(null);

    try {
      await api.deleteWorktree(projectId, worktree.path);
      onWorktreeDeleted();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete worktree");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setError(null);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Worktree</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this worktree?
          </DialogDescription>
        </DialogHeader>

        {worktree && (
          <div className="space-y-2">
            <div className="text-sm">
              <span className="font-medium">Path:</span>{" "}
              <span className="text-muted-foreground">{worktree.path}</span>
            </div>
            {worktree.branch && (
              <div className="text-sm">
                <span className="font-medium">Branch:</span>{" "}
                <span className="text-muted-foreground">{worktree.branch}</span>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
