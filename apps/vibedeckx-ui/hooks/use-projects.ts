"use client";

import { useState, useEffect, useCallback } from "react";
import { api, type Project } from "@/lib/api";

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getProjects();
      setProjects(data);
      if (data.length > 0 && !currentProject) {
        setCurrentProject(data[0]);
      }
    } finally {
      setLoading(false);
    }
  }, [currentProject]);

  useEffect(() => {
    fetchProjects();
  }, []);

  const createProject = async (name: string, path: string) => {
    const project = await api.createProject(name, path);
    setProjects((prev) => [project, ...prev]);
    setCurrentProject(project);
    return project;
  };

  const createRemoteProject = async (
    name: string,
    path: string,
    remoteUrl: string,
    remoteApiKey: string
  ) => {
    const project = await api.createRemoteProject(name, path, remoteUrl, remoteApiKey);
    setProjects((prev) => [project, ...prev]);
    setCurrentProject(project);
    return project;
  };

  const deleteProject = async (id: string) => {
    await api.deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (currentProject?.id === id) {
      setCurrentProject(projects.find((p) => p.id !== id) ?? null);
    }
  };

  const selectProject = (project: Project) => {
    setCurrentProject(project);
  };

  return {
    projects,
    currentProject,
    loading,
    createProject,
    createRemoteProject,
    deleteProject,
    selectProject,
    refresh: fetchProjects,
  };
}
