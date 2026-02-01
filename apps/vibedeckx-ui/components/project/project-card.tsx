"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FolderOpen, Calendar, GitBranch } from "lucide-react";
import { api, type Project, type Worktree } from "@/lib/api";

interface ProjectCardProps {
  project: Project;
  selectedWorktree: string;
  onWorktreeChange: (path: string) => void;
}

export function ProjectCard({ project, selectedWorktree, onWorktreeChange }: ProjectCardProps) {
  const [worktrees, setWorktrees] = useState<Worktree[]>([]);
  const [loading, setLoading] = useState(true);
  const createdDate = new Date(project.created_at).toLocaleDateString();

  useEffect(() => {
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

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{project.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FolderOpen className="h-4 w-4" />
          <span className="truncate">{project.path}</span>
        </div>
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
              <Select value={selectedWorktree} onValueChange={onWorktreeChange}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select worktree" />
                </SelectTrigger>
                <SelectContent>
                  {worktrees.map((wt) => (
                    <SelectItem key={wt.path} value={wt.path}>
                      {wt.path}
                      {wt.branch && (
                        <span className="text-muted-foreground ml-2">({wt.branch})</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
