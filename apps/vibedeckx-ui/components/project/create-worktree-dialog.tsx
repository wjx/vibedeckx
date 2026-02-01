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
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

interface CreateWorktreeDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onWorktreeCreated: (worktreePath: string) => void;
}

export function CreateWorktreeDialog({
  projectId,
  open,
  onOpenChange,
  onWorktreeCreated,
}: CreateWorktreeDialogProps) {
  const [branchName, setBranchName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate worktree path from branch name
  const worktreePath = branchName.trim()
    ? `.worktrees/${branchName.trim().replace(/\//g, "-")}`
    : "";

  const handleCreate = async () => {
    if (!branchName.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const worktree = await api.createWorktree(projectId, branchName.trim());
      onWorktreeCreated(worktree.path);
      onOpenChange(false);
      setBranchName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create worktree");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setBranchName("");
      setError(null);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Worktree</DialogTitle>
          <DialogDescription>
            Create a new branch based on main
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="branch-name" className="text-sm font-medium">
              Branch Name
            </label>
            <Input
              id="branch-name"
              placeholder="feature/my-feature"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && branchName.trim()) {
                  handleCreate();
                }
              }}
            />
          </div>

          {worktreePath && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                Worktree Path (auto-generated)
              </label>
              <div className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded-md">
                {worktreePath}
              </div>
            </div>
          )}

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!branchName.trim() || loading}
          >
            {loading ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
