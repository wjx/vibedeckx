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
  onProjectCreated: (name: string, path: string) => Promise<void> | Promise<unknown>;
  onRemoteProjectCreated?: (
    name: string,
    path: string,
    remoteUrl: string,
    remoteApiKey: string
  ) => Promise<void> | Promise<unknown>;
}

type ProjectMode = "local" | "remote";
type ConnectionStatus = "idle" | "testing" | "success" | "error";

export function CreateProjectDialog({
  open,
  onOpenChange,
  onProjectCreated,
  onRemoteProjectCreated,
}: CreateProjectDialogProps) {
  const [mode, setMode] = useState<ProjectMode>("local");

  // Local project state
  const [name, setName] = useState("");
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

  const handleSubmitLocal = async () => {
    if (!name.trim() || !path.trim()) {
      setError("Please fill in all fields");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await onProjectCreated(name.trim(), path.trim());
      resetForm();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitRemote = async () => {
    if (!name.trim() || !remotePath.trim() || !remoteUrl.trim() || !apiKey.trim()) {
      setError("Please fill in all fields");
      return;
    }

    if (connectionStatus !== "success") {
      setError("Please test the connection first");
      return;
    }

    if (!onRemoteProjectCreated) {
      setError("Remote project creation not supported");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await onRemoteProjectCreated(name.trim(), remotePath.trim(), remoteUrl.trim(), apiKey.trim());
      resetForm();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create remote project");
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

        {/* Mode Tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          <button
            className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              mode === "local"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setMode("local")}
          >
            Local
          </button>
          <button
            className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              mode === "remote"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setMode("remote")}
          >
            Remote
          </button>
        </div>

        {mode === "local" ? (
          /* Local Project Form */
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Project Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Project"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Project Folder</label>
              <div className="flex gap-2">
                <Input
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="/path/to/project"
                  className="flex-1"
                />
                <Button variant="outline" onClick={handleSelectFolder}>
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          /* Remote Project Form */
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Remote Server URL</label>
              <Input
                value={remoteUrl}
                onChange={(e) => {
                  setRemoteUrl(e.target.value);
                  setConnectionStatus("idle");
                }}
                placeholder="http://remote-server:5173"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">API Key</label>
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
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select Remote Directory</label>
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
                <div className="space-y-2">
                  <label className="text-sm font-medium">Project Name</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Remote Project"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={mode === "local" ? handleSubmitLocal : handleSubmitRemote}
            disabled={loading}
          >
            {loading ? "Creating..." : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
