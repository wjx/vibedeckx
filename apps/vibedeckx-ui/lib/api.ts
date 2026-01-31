const API_BASE = "";

export interface Project {
  id: string;
  name: string;
  path: string;
  created_at: string;
}

export const api = {
  async getProjects(): Promise<Project[]> {
    const res = await fetch(`${API_BASE}/api/projects`);
    const data = await res.json();
    return data.projects;
  },

  async getProject(id: string): Promise<Project> {
    const res = await fetch(`${API_BASE}/api/projects/${id}`);
    const data = await res.json();
    return data.project;
  },

  async selectFolder(): Promise<{ path: string | null; cancelled: boolean }> {
    const res = await fetch(`${API_BASE}/api/dialog/select-folder`, {
      method: "POST",
    });
    return res.json();
  },

  async createProject(name: string, path: string): Promise<Project> {
    const res = await fetch(`${API_BASE}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, path }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error);
    }
    const data = await res.json();
    return data.project;
  },

  async deleteProject(id: string): Promise<void> {
    await fetch(`${API_BASE}/api/projects/${id}`, {
      method: "DELETE",
    });
  },
};
