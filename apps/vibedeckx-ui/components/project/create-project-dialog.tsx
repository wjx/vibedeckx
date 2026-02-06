"use client";

import { useState } from "react";
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
import { api } from "@/lib/api";
import { RemoteDirectoryBrowser } from "./remote-directory-browser";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectCreated: (opts: {
    name: string;
    path?: string;
    remotePath?: string;
    remoteUrl?: string;
    remoteApiKey?: string;
  }) => Promise<void> | Promise<unknown>;
}

type ConnectionStatus = "idle" | "testing" | "success" | "error";

export function CreateProjectDialog({
  open,
  onOpenChange,
  onProjectCreated,
}: CreateProjectDialogProps) {
  // Project name
  const [name, setName] = useState("");

  // Local project state
  const [path, setPath] = useState("");

  // Remote project state
  const [remoteUrl, setRemoteUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [remotePath, setRemotePath] = useState("");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [connectionError, setConnectionError] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const resetForm = () => {
    setName("");
    setPath("");
    setRemoteUrl("");
    setApiKey("");
    setRemotePath("");
    setConnectionStatus("idle");
    setConnectionError("");
    setError("");
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetForm();
    }
    onOpenChange(open);
  };

  const handleSelectFolder = async () => {
    const result = await api.selectFolder();
    if (result.path) {
      setPath(result.path);
      if (!name) {
        const folderName = result.path.split("/").pop() || "";
        setName(folderName);
      }
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
    if (!name) {
      const folderName = selectedPath.split("/").pop() || "";
      setName(folderName);
    }
  };

  const hasLocalPath = path.trim().length > 0;
  const hasRemote = remotePath.trim().length > 0 && remoteUrl.trim().length > 0 && apiKey.trim().length > 0;

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Project name is required");
      return;
    }

    if (!hasLocalPath && !hasRemote) {
      setError("Please provide a local folder, remote server, or both");
      return;
    }

    if (remotePath.trim() && connectionStatus !== "success") {
      setError("Please test the remote connection first");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await onProjectCreated({
        name: name.trim(),
        ...(hasLocalPath ? { path: path.trim() } : {}),
        ...(hasRemote ? {
          remotePath: remotePath.trim(),
          remoteUrl: remoteUrl.trim(),
          remoteApiKey: apiKey.trim(),
        } : {}),
      });
      resetForm();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
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
                  setConnectionStatus("idle");
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
                        setConnectionStatus("idle");
                      }}
                      placeholder="Enter API key"
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
                      apiKey={apiKey}
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
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? "Creating..." : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
