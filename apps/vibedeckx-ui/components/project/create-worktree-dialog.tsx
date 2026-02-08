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
import { api, type Project, type WorktreeTarget } from "@/lib/api";

interface CreateWorktreeDialogProps {
  projectId: string;
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onWorktreeCreated: (worktreePath: string) => void;
}

export function CreateWorktreeDialog({
  projectId,
  project,
  open,
  onOpenChange,
  onWorktreeCreated,
}: CreateWorktreeDialogProps) {
  const [branchName, setBranchName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [createLocal, setCreateLocal] = useState(true);
  const [createRemote, setCreateRemote] = useState(true);

  const isHybrid = !!(project.path && project.remote_path);

  // Generate worktree path from branch name
  const worktreePath = branchName.trim()
    ? `.worktrees/${branchName.trim().replace(/\//g, "-")}`
    : "";

  const handleCreate = async () => {
    if (!branchName.trim()) return;

    setLoading(true);
    setError(null);
    setWarning(null);

    try {
      let targets: WorktreeTarget[] | undefined;
      if (isHybrid) {
        targets = [];
        if (createLocal) targets.push("local");
        if (createRemote) targets.push("remote");
      }

      const result = await api.createWorktree(projectId, branchName.trim(), targets);

      if (result.partialSuccess) {
        // Find which target failed
        const failedTarget = result.results?.remote?.success === false ? "remote" : "local";
        const failedError = result.results?.[failedTarget]?.error || "Unknown error";
        setWarning(`Worktree created locally, but ${failedTarget} creation failed: ${failedError}`);
      }

      onWorktreeCreated(result.worktree.path);
      if (!result.partialSuccess) {
        onOpenChange(false);
        setBranchName("");
      }
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
      setWarning(null);
      setCreateLocal(true);
      setCreateRemote(true);
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
                if (e.key === "Enter" && branchName.trim() && (!isHybrid || createLocal || createRemote)) {
                  handleCreate();
                }
              }}
            />
          </div>

          {isHybrid && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Create On</label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createLocal}
                    onChange={(e) => {
                      if (!e.target.checked && !createRemote) return;
                      setCreateLocal(e.target.checked);
                    }}
                    disabled={loading}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  <span>Local</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {project.path}
                  </span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createRemote}
                    onChange={(e) => {
                      if (!e.target.checked && !createLocal) return;
                      setCreateRemote(e.target.checked);
                    }}
                    disabled={loading}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  <span>Remote</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {project.remote_path}
                  </span>
                </label>
              </div>
            </div>
          )}

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

          {warning && (
            <div className="text-sm text-yellow-600 dark:text-yellow-500 bg-yellow-500/10 px-3 py-2 rounded-md">
              {warning}
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
            disabled={!branchName.trim() || loading || (isHybrid && !createLocal && !createRemote)}
          >
            {loading ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
