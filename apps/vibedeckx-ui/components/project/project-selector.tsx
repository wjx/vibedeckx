"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { CreateProjectDialog } from "./create-project-dialog";
import type { Project } from "@/lib/api";

interface ProjectSelectorProps {
  projects: Project[];
  currentProject: Project | null;
  onSelectProject: (project: Project) => void;
  onCreateProject: (name: string, path: string) => Promise<void> | Promise<unknown>;
}

export function ProjectSelector({
  projects,
  currentProject,
  onSelectProject,
  onCreateProject,
}: ProjectSelectorProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <Select
        value={currentProject?.id}
        onValueChange={(id) => {
          const project = projects.find((p) => p.id === id);
          if (project) onSelectProject(project);
        }}
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="Select a project" />
        </SelectTrigger>
        <SelectContent>
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              {project.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" size="icon" onClick={() => setDialogOpen(true)}>
        <Plus className="h-4 w-4" />
      </Button>
      <CreateProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onProjectCreated={onCreateProject}
      />
    </div>
  );
}
