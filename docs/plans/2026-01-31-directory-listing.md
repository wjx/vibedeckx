# Directory Listing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Display files and folders in the project's directory within the project info card.

**Architecture:** Add backend API endpoint to read directory contents, extend API client, and create a file tree component in ProjectCard.

**Tech Stack:** Node.js fs module, Fastify, React, lucide-react icons

---

### Task 1: Add Backend Endpoint for Directory Listing

**Files:**
- Modify: `packages/vibedeckx/src/server.ts`

**Step 1: Add the directory listing endpoint**

Add a new GET endpoint `/api/projects/:id/files` that reads the project directory and returns a list of files and folders.

```typescript
// Add this interface near the top
interface DirectoryEntry {
  name: string;
  type: "file" | "directory";
}

// Add this endpoint after existing project routes
server.get<{ Params: { id: string } }>(
  "/api/projects/:id/files",
  async (request, reply) => {
    const { id } = request.params;
    const project = storage.projects.getById(id);

    if (!project) {
      return reply.status(404).send({ error: "Project not found" });
    }

    try {
      const entries = await fs.promises.readdir(project.path, {
        withFileTypes: true,
      });

      const result: DirectoryEntry[] = entries
        .filter((entry) => !entry.name.startsWith("."))
        .map((entry) => ({
          name: entry.name,
          type: entry.isDirectory() ? "directory" : "file",
        }))
        .sort((a, b) => {
          // Directories first, then files
          if (a.type !== b.type) {
            return a.type === "directory" ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

      return result;
    } catch (error) {
      return reply.status(500).send({ error: "Failed to read directory" });
    }
  }
);
```

**Step 2: Add fs import if not present**

Ensure `fs` is imported at the top of the file:
```typescript
import fs from "fs";
```

**Step 3: Test the endpoint**

Run: `curl http://localhost:5173/api/projects/<project-id>/files`
Expected: JSON array of directory entries

**Step 4: Commit**

```bash
git add packages/vibedeckx/src/server.ts
git commit -m "feat: add directory listing API endpoint"
```

---

### Task 2: Add API Client Method

**Files:**
- Modify: `apps/vibedeckx-ui/lib/api.ts`

**Step 1: Add type definition and API method**

```typescript
export interface DirectoryEntry {
  name: string;
  type: "file" | "directory";
}

export async function getProjectFiles(id: string): Promise<DirectoryEntry[]> {
  const res = await fetch(`${API_BASE}/projects/${id}/files`);
  if (!res.ok) {
    throw new Error("Failed to fetch project files");
  }
  return res.json();
}
```

**Step 2: Commit**

```bash
git add apps/vibedeckx-ui/lib/api.ts
git commit -m "feat: add getProjectFiles API client method"
```

---

### Task 3: Create File List Component

**Files:**
- Create: `apps/vibedeckx-ui/components/project/file-list.tsx`

**Step 1: Create the component**

```tsx
"use client";

import { File, Folder } from "lucide-react";
import type { DirectoryEntry } from "@/lib/api";

interface FileListProps {
  entries: DirectoryEntry[];
  isLoading?: boolean;
}

export function FileList({ entries, isLoading }: FileListProps) {
  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground">Loading files...</div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">No files found</div>
    );
  }

  return (
    <div className="space-y-1">
      {entries.map((entry) => (
        <div
          key={entry.name}
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          {entry.type === "directory" ? (
            <Folder className="h-4 w-4 text-blue-500" />
          ) : (
            <File className="h-4 w-4" />
          )}
          <span className="truncate">{entry.name}</span>
        </div>
      ))}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/vibedeckx-ui/components/project/file-list.tsx
git commit -m "feat: add FileList component"
```

---

### Task 4: Integrate File List into ProjectCard

**Files:**
- Modify: `apps/vibedeckx-ui/components/project/project-card.tsx`

**Step 1: Add state and fetch files**

Update ProjectCard to fetch and display directory contents:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FolderOpen, Calendar } from "lucide-react";
import type { Project } from "@/lib/api";
import { getProjectFiles, type DirectoryEntry } from "@/lib/api";
import { FileList } from "./file-list";

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const [files, setFiles] = useState<DirectoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getProjectFiles(project.id)
      .then(setFiles)
      .catch(() => setFiles([]))
      .finally(() => setIsLoading(false));
  }, [project.id]);

  const createdDate = new Date(project.created_at).toLocaleDateString();

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
        <div className="border-t pt-3">
          <div className="text-sm font-medium mb-2">Files</div>
          <FileList entries={files} isLoading={isLoading} />
        </div>
      </CardContent>
    </Card>
  );
}
```

**Step 2: Commit**

```bash
git add apps/vibedeckx-ui/components/project/project-card.tsx
git commit -m "feat: integrate file list into project card"
```

---

### Task 5: Build and Test

**Step 1: Build the project**

Run: `pnpm build`
Expected: Build succeeds

**Step 2: Start and verify**

Run: `pnpm start`
Expected: Project card shows directory contents with folder/file icons

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address any build issues"
```
