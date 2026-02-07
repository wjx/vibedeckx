"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FolderOpen, Loader2, Check, X } from "lucide-react";
import { api, type Project } from "@/lib/api";
import { RemoteDirectoryBrowser } from "./remote-directory-browser";

interface EditProjectDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectUpdated: (id: string, opts: {
    name?: string;
    path?: string | null;
    remotePath?: string | null;
    remoteUrl?: string | null;
    remoteApiKey?: string | null;
  }) => Promise<void> | Promise<unknown>;
}

type ConnectionStatus = "idle" | "testing" | "success" | "error";

export function EditProjectDialog({
  project,
  open,
  onOpenChange,
  onProjectUpdated,
}: EditProjectDialogProps) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [remotePath, setRemotePath] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [connectionError, setConnectionError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Populate form when dialog opens or project changes
  useEffect(() => {
    if (open) {
      setName(project.name);
      setPath(project.path ?? "");
      setRemoteUrl(project.remote_url ?? "");
      setApiKey("");
      setRemotePath(project.remote_path ?? "");
      setConnectionStatus(project.remote_url ? "success" : "idle");
      setConnectionError("");
      setError("");
    }
  }, [open, project]);

  const handleSelectFolder = async () => {
    const result = await api.selectFolder();
    if (result.path) {
      setPath(result.path);
    }
  };

  const handleTestConnection = async () => {
    if (!remoteUrl || !apiKey) {
      setConnectionError("URL and API key are required");
      return;
    }

    setConnectionStatus("testing");
    setConnectionError("");

    try {
      await api.testRemoteConnection(remoteUrl, apiKey);
      setConnectionStatus("success");
    } catch (e) {
      setConnectionStatus("error");
      setConnectionError(e instanceof Error ? e.message : "Connection failed");
    }
  };

  const handleRemotePathSelect = (selectedPath: string) => {
    setRemotePath(selectedPath);
  };

  const hasLocalPath = path.trim().length > 0;
  const hasRemote = remotePath.trim().length > 0 && remoteUrl.trim().length > 0;

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Project name is required");
      return;
    }

    if (!hasLocalPath && !hasRemote) {
      setError("Project must have at least a local folder or remote server");
      return;
    }

    // If remote path is set and connection was not previously established, require test
    if (hasRemote && connectionStatus !== "success") {
      setError("Please test the remote connection first");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const opts: {
        name?: string;
        path?: string | null;
        remotePath?: string | null;
        remoteUrl?: string | null;
        remoteApiKey?: string | null;
      } = {};

      // Only send changed fields
      if (name.trim() !== project.name) {
        opts.name = name.trim();
      }

      const newPath = hasLocalPath ? path.trim() : null;
      if (newPath !== (project.path ?? null)) {
        opts.path = newPath;
      }

      const newRemotePath = hasRemote ? remotePath.trim() : null;
      if (newRemotePath !== (project.remote_path ?? null)) {
        opts.remotePath = newRemotePath;
      }

      const newRemoteUrl = hasRemote ? remoteUrl.trim() : null;
      if (newRemoteUrl !== (project.remote_url ?? null)) {
        opts.remoteUrl = newRemoteUrl;
      }

      // Only send API key if user typed a new one, or if clearing remote
      if (apiKey.trim()) {
        opts.remoteApiKey = apiKey.trim();
      } else if (!hasRemote && (project.remote_url || project.remote_path)) {
        // Clearing remote config
        opts.remoteApiKey = null;
      }

      await onProjectUpdated(project.id, opts);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Project Name */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Project Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
            />
          </div>

          {/* Local Folder Section */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Local Folder</label>
            <div className="flex gap-2">
              <Input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/path/to/project (optional)"
                className="flex-1"
              />
              <Button variant="outline" onClick={handleSelectFolder}>
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Remote Server Section */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Remote Server</label>
            <div className="space-y-2">
              <Input
                value={remoteUrl}
                onChange={(e) => {
                  setRemoteUrl(e.target.value);
                  if (e.target.value !== project.remote_url) {
                    setConnectionStatus("idle");
                  }
                }}
                placeholder="http://remote-server:5173 (optional)"
              />
            </div>
            {remoteUrl && (
              <>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">API Key</label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        if (e.target.value) {
                          setConnectionStatus("idle");
                        }
                      }}
                      placeholder={project.remote_url ? "(unchanged)" : "Enter API key"}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      onClick={handleTestConnection}
                      disabled={connectionStatus === "testing" || !remoteUrl || !apiKey}
                    >
                      {connectionStatus === "testing" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : connectionStatus === "success" ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : connectionStatus === "error" ? (
                        <X className="h-4 w-4 text-red-500" />
                      ) : (
                        "Test"
                      )}
                    </Button>
                  </div>
                  {connectionError && (
                    <p className="text-xs text-red-500">{connectionError}</p>
                  )}
                  {connectionStatus === "success" && (
                    <p className="text-xs text-green-500">Connection successful</p>
                  )}
                </div>

                {connectionStatus === "success" && (
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Select Remote Directory</label>
                    <RemoteDirectoryBrowser
                      remoteUrl={remoteUrl}
                      apiKey={apiKey || "placeholder-existing-key"}
                      onSelect={handleRemotePathSelect}
                      selectedPath={remotePath}
                    />
                    {remotePath && (
                      <p className="text-xs text-muted-foreground">
                        Selected: <span className="font-mono">{remotePath}</span>
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
