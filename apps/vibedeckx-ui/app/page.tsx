'use client';
import { useState, useEffect } from 'react';
import { ProjectSelector } from '@/components/project/project-selector';
import { ProjectCard } from '@/components/project/project-card';
import { useProjects } from '@/hooks/use-projects';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { CreateProjectDialog } from '@/components/project/create-project-dialog';
import { ExecutorPanel } from '@/components/executor';
import { AgentConversation } from '@/components/agent';

export default function Home() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedWorktree, setSelectedWorktree] = useState(".");

  const {
    projects,
    currentProject,
    loading: projectsLoading,
    createProject,
    selectProject,
  } = useProjects();

  // Reset worktree selection when project changes
  useEffect(() => {
    setSelectedWorktree(".");
  }, [currentProject?.id]);

  // 显示欢迎页面（无项目时）
  if (!projectsLoading && projects.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-6">
          <h1 className="text-4xl font-bold">Welcome to Vibedeckx</h1>
          <p className="text-muted-foreground">
            Create your first project to get started
          </p>
          <Button size="lg" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-5 w-5 mr-2" />
            Create Project
          </Button>
          <CreateProjectDialog
            open={createDialogOpen}
            onOpenChange={setCreateDialogOpen}
            onProjectCreated={createProject}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header with Project Selector */}
      <div className="border-b p-3 h-14 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Vibedeckx</h1>
        <ProjectSelector
          projects={projects}
          currentProject={currentProject}
          onSelectProject={selectProject}
          onCreateProject={createProject}
        />
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Project Card + Agent Conversation */}
        <div className="w-1/2 flex flex-col border-r overflow-hidden">
          {/* Project Info */}
          {currentProject && (
            <div className="p-4 border-b flex-shrink-0">
              <ProjectCard
                project={currentProject}
                selectedWorktree={selectedWorktree}
                onWorktreeChange={setSelectedWorktree}
              />
            </div>
          )}

          {/* Agent Conversation */}
          <div className="flex-1 overflow-hidden">
            <AgentConversation
              projectId={currentProject?.id ?? null}
              worktreePath={selectedWorktree}
            />
          </div>
        </div>

        {/* Right Panel: Executor Panel */}
        <div className="w-1/2 flex flex-col overflow-hidden">
          <ExecutorPanel
            projectId={currentProject?.id ?? null}
            selectedWorktree={selectedWorktree}
          />
        </div>
      </div>
    </div>
  );
}
