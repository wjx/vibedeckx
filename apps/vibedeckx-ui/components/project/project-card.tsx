"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FolderOpen, Calendar, GitBranch, Plus, ChevronDown, Trash2, Globe, MoreVertical, Pencil } from "lucide-react";
import { api, type Project, type Worktree } from "@/lib/api";
import { CreateWorktreeDialog } from "./create-worktree-dialog";
import { DeleteWorktreeDialog } from "./delete-worktree-dialog";
import { EditProjectDialog } from "./edit-project-dialog";

interface ProjectCardProps {
  project: Project;
  selectedWorktree: string;
  onWorktreeChange: (path: string) => void;
  onUpdateProject: (id: string, opts: {
    name?: string;
    path?: string | null;
    remotePath?: string | null;
    remoteUrl?: string | null;
    remoteApiKey?: string | null;
  }) => Promise<void> | Promise<unknown>;
  onDeleteProject: (id: string) => Promise<void>;
}

export function ProjectCard({ project, selectedWorktree, onWorktreeChange, onUpdateProject, onDeleteProject }: ProjectCardProps) {
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [worktreeToDelete, setWorktreeToDelete] = useState<Worktree | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const createdDate = new Date(project.created_at).toLocaleDateString();

  const fetchWorktrees = useCallback(() => {
    api.getProjectWorktrees(project.id)
      .then((wts) => {
        setWorktrees(wts);
        // If current selection not in list, reset to first
        if (wts.length > 0 && !wts.some(w => w.path === selectedWorktree)) {
          onWorktreeChange(wts[0].path);
        }
      })
      .catch(() => setWorktrees([{ path: ".", branch: null }]))
      .finally(() => setLoading(false));
  }, [project.id, selectedWorktree, onWorktreeChange]);

  useEffect(() => {
    fetchWorktrees();
  }, [fetchWorktrees]);

  const handleWorktreeCreated = (worktreePath: string) => {
    fetchWorktrees();
    onWorktreeChange(worktreePath);
  };

  const handleDeleteClick = (e: React.MouseEvent, worktree: Worktree) => {
    e.preventDefault();
    e.stopPropagation();
    setWorktreeToDelete(worktree);
    setDeleteDialogOpen(true);
  };

  const handleWorktreeDeleted = () => {
    onWorktreeChange(".");
    fetchWorktrees();
  };

  const selectedWorktreeData = worktrees.find(w => w.path === selectedWorktree);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg flex-1">{project.name}</CardTitle>
          {project.path && project.remote_path ? (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-500" title={`Local + Remote: ${project.remote_url}`}>
              <Globe className="h-3 w-3" />
              Local + Remote
            </span>
          ) : project.remote_path ? (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500" title={`Remote: ${project.remote_url}`}>
              <Globe className="h-3 w-3" />
              Remote
            </span>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="h-7 w-7">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditDialogOpen(true)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onDeleteProject(project.id)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {project.path && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FolderOpen className="h-4 w-4" />
            <span className="truncate">{project.path}</span>
          </div>
        )}
        {project.remote_path && project.remote_url && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Globe className="h-4 w-4" />
            <span className="truncate">{project.remote_url}:{project.remote_path}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>{createdDate}</span>
        </div>
        <div className="border-t pt-2">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading worktrees...</div>
          ) : (
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="flex-1 justify-between">
                    <span className="truncate">
                      {selectedWorktree}
                      {selectedWorktreeData?.branch && (
                        <span className="text-muted-foreground ml-2">
                          ({selectedWorktreeData.branch})
                        </span>
                      )}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
                  {worktrees.map((wt) => (
                    <DropdownMenuItem
                      key={wt.path}
                      className="flex items-center justify-between gap-2"
                      onSelect={() => onWorktreeChange(wt.path)}
                    >
                      <span className="truncate">
                        {wt.path}
                        {wt.branch && (
                          <span className="text-muted-foreground ml-2">({wt.branch})</span>
                        )}
                      </span>
                      {wt.path !== "." && (
                        <button
                          onClick={(e) => handleDeleteClick(e, wt)}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                          title="Delete worktree"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setCreateDialogOpen(true)}
                title="Create new worktree"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
          <CreateWorktreeDialog
            projectId={project.id}
            open={createDialogOpen}
            onOpenChange={setCreateDialogOpen}
            onWorktreeCreated={handleWorktreeCreated}
          />
          <DeleteWorktreeDialog
            projectId={project.id}
            worktree={worktreeToDelete}
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            onWorktreeDeleted={handleWorktreeDeleted}
          />
        </div>
      </CardContent>
      <EditProjectDialog
        project={project}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onProjectUpdated={onUpdateProject}
      />
    </Card>
  );
}
