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
import { FolderOpen, Calendar, GitBranch, Plus, ChevronDown, Trash2, Globe, MoreVertical, Pencil, ArrowUp, ArrowDown, Play, RotateCcw } from "lucide-react";
import { api, type Project, type Worktree, type Task, type SyncButtonConfig, type SyncExecutionResult, type ExecutionMode } from "@/lib/api";
import { CreateWorktreeDialog } from "./create-worktree-dialog";
import { DeleteWorktreeDialog } from "./delete-worktree-dialog";
import { EditProjectDialog } from "./edit-project-dialog";
import { SyncOutputDialog } from "./sync-output-dialog";

interface ProjectCardProps {
  project: Project;
  selectedBranch: string | null;
  onBranchChange: (branch: string | null) => void;
  onUpdateProject: (id: string, opts: {
    name?: string;
    path?: string | null;
    remotePath?: string | null;
    remoteUrl?: string | null;
    remoteApiKey?: string | null;
    syncUpConfig?: SyncButtonConfig | null;
    syncDownConfig?: SyncButtonConfig | null;
  }) => Promise<void> | Promise<unknown>;
  onDeleteProject: (id: string) => Promise<void>;
  onSyncPrompt?: (prompt: string, executionMode: ExecutionMode) => void;
  worktrees?: Worktree[];
  onWorktreesRefetch?: () => void;
  assignedTask?: Task | null;
  onStartTask?: (task: Task) => void;
  onResetTask?: (taskId: string) => void;
}

export function ProjectCard({ project, selectedBranch, onBranchChange, onUpdateProject, onDeleteProject, onSyncPrompt, worktrees: externalWorktrees, onWorktreesRefetch, assignedTask, onStartTask, onResetTask }: ProjectCardProps) {
  const [internalWorktrees, setInternalWorktrees] = useState<Worktree[]>([]);
  const [internalLoading, setInternalLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [worktreeToDelete, setWorktreeToDelete] = useState<Worktree | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [syncOutputOpen, setSyncOutputOpen] = useState(false);
  const [syncOutput, setSyncOutput] = useState<{
    type: 'up' | 'down';
    result: SyncExecutionResult | null;
    loading: boolean;
  }>({ type: 'up', result: null, loading: false });
  const createdDate = new Date(project.created_at).toLocaleDateString();

  const useExternal = externalWorktrees !== undefined;
  const worktrees = useExternal ? externalWorktrees : internalWorktrees;
  const loading = useExternal ? false : internalLoading;

  const fetchWorktrees = useCallback(() => {
    if (useExternal) return;
    api.getProjectWorktrees(project.id)
      .then((wts) => {
        setInternalWorktrees(wts);
      })
      .catch(() => setInternalWorktrees([{ branch: null }]))
      .finally(() => setInternalLoading(false));
  }, [project.id, useExternal]);

  useEffect(() => {
    if (!useExternal) fetchWorktrees();
  }, [fetchWorktrees, useExternal]);

  const handleWorktreeCreated = (branch: string) => {
    if (onWorktreesRefetch) onWorktreesRefetch();
    else fetchWorktrees();
    onBranchChange(branch);
  };

  const handleDeleteClick = (e: React.MouseEvent, worktree: Worktree) => {
    e.preventDefault();
    e.stopPropagation();
    setWorktreeToDelete(worktree);
    setDeleteDialogOpen(true);
  };

  const handleWorktreeDeleted = () => {
    onBranchChange(null);
    if (onWorktreesRefetch) onWorktreesRefetch();
    else fetchWorktrees();
  };

  const handleSyncButton = async (syncType: 'up' | 'down') => {
    const config = syncType === 'up' ? project.sync_up_config : project.sync_down_config;
    if (!config) return;

    if (config.actionType === 'prompt') {
      onSyncPrompt?.(config.content, config.executionMode);
      return;
    }

    // Command execution
    setSyncOutput({ type: syncType, result: null, loading: true });
    setSyncOutputOpen(true);

    try {
      const result = await api.executeSyncCommand(project.id, syncType, selectedBranch);
      setSyncOutput({ type: syncType, result, loading: false });
    } catch (e) {
      setSyncOutput({
        type: syncType,
        result: {
          success: false,
          stdout: '',
          stderr: e instanceof Error ? e.message : 'Command execution failed',
          exitCode: 1,
        },
        loading: false,
      });
    }
  };

  const selectedWorktreeData = worktrees.find(w => w.branch === selectedBranch);

  const showSyncUp = !!project.sync_up_config;
  const showSyncDown = !!project.sync_down_config;

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
          {showSyncUp && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-7 w-7"
              onClick={() => handleSyncButton('up')}
              title={`Sync Up: ${project.sync_up_config!.content.slice(0, 50)}${project.sync_up_config!.content.length > 50 ? '...' : ''}`}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          )}
          {showSyncDown && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-7 w-7"
              onClick={() => handleSyncButton('down')}
              title={`Sync Down: ${project.sync_down_config!.content.slice(0, 50)}${project.sync_down_config!.content.length > 50 ? '...' : ''}`}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          )}
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
                      {selectedBranch ?? "main"}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
                  {worktrees.map((wt) => (
                    <DropdownMenuItem
                      key={wt.branch ?? "__main__"}
                      className="flex items-center justify-between gap-2"
                      onSelect={() => onBranchChange(wt.branch)}
                    >
                      <span className="truncate">
                        {wt.branch ?? "main"}
                      </span>
                      {wt.branch !== null && (
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
            project={project}
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
        {assignedTask && (
          <div className="border-t pt-2 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground text-xs font-medium">Assigned Task:</span>
              <span className="text-sm truncate flex-1">{assignedTask.title}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={() => onStartTask?.(assignedTask)}
              >
                <Play className="h-3.5 w-3.5 mr-1" />
                Start
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onResetTask?.(assignedTask.id)}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Reset
              </Button>
            </div>
          </div>
        )}
      </CardContent>
      <EditProjectDialog
        project={project}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onProjectUpdated={onUpdateProject}
      />
      <SyncOutputDialog
        open={syncOutputOpen}
        onOpenChange={setSyncOutputOpen}
        syncType={syncOutput.type}
        result={syncOutput.result}
        loading={syncOutput.loading}
      />
    </Card>
  );
}
