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
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ExecutionModeToggle } from "@/components/ui/execution-mode-toggle";
import { FolderOpen, Loader2, Check, X, Terminal, Bot } from "lucide-react";
import { api, type Project, type SyncButtonConfig, type SyncActionType, type ExecutionMode } from "@/lib/api";
import { RemoteDirectoryBrowser } from "./remote-directory-browser";
import { cn } from "@/lib/utils";

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
    syncUpConfig?: SyncButtonConfig | null;
    syncDownConfig?: SyncButtonConfig | null;
  }) => Promise<void> | Promise<unknown>;
}

type ConnectionStatus = "idle" | "testing" | "success" | "error";

interface SyncConfigState {
  enabled: boolean;
  actionType: SyncActionType;
  executionMode: ExecutionMode;
  content: string;
}

const defaultSyncConfig: SyncConfigState = {
  enabled: true,
  actionType: 'command',
  executionMode: 'local',
  content: '',
};

function fromSyncButtonConfig(config?: SyncButtonConfig): SyncConfigState {
  if (!config) return { ...defaultSyncConfig };
  return {
    enabled: config.enabled,
    actionType: config.actionType,
    executionMode: config.executionMode,
    content: config.content,
  };
}

function toSyncButtonConfig(state: SyncConfigState): SyncButtonConfig {
  return {
    enabled: state.enabled,
    actionType: state.actionType,
    executionMode: state.executionMode,
    content: state.content,
  };
}

function ActionTypeToggle({
  actionType,
  onActionTypeChange,
}: {
  actionType: SyncActionType;
  onActionTypeChange: (type: SyncActionType) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-md border bg-muted/50 p-0.5 text-xs">
      <button
        onClick={() => onActionTypeChange("command")}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 transition-colors",
          actionType === "command"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Terminal className="h-3 w-3" />
        Command
      </button>
      <button
        onClick={() => onActionTypeChange("prompt")}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 transition-colors",
          actionType === "prompt"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Bot className="h-3 w-3" />
        Prompt
      </button>
    </div>
  );
}

function SyncConfigForm({
  config,
  onChange,
  label,
}: {
  config: SyncConfigState;
  onChange: (config: SyncConfigState) => void;
  label: string;
}) {
  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        <Button
          variant={config.enabled ? "default" : "outline"}
          size="sm"
          onClick={() => onChange({ ...config, enabled: !config.enabled })}
        >
          {config.enabled ? "Enabled" : "Disabled"}
        </Button>
      </div>

      {config.enabled && (
        <>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Action Type</label>
            <div>
              <ActionTypeToggle
                actionType={config.actionType}
                onActionTypeChange={(actionType) => onChange({ ...config, actionType })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Execution Environment</label>
            <div>
              <ExecutionModeToggle
                mode={config.executionMode}
                onModeChange={(executionMode) => onChange({ ...config, executionMode })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">
              {config.actionType === 'command' ? 'Shell Command' : 'Agent Prompt'}
            </label>
            <Textarea
              value={config.content}
              onChange={(e) => onChange({ ...config, content: e.target.value })}
              placeholder={config.actionType === 'command' ? 'git push origin HEAD' : 'Please pull the latest changes and rebase...'}
              rows={3}
            />
          </div>
        </>
      )}
    </div>
  );
}

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
  const [syncUpConfig, setSyncUpConfig] = useState<SyncConfigState>(defaultSyncConfig);
  const [syncDownConfig, setSyncDownConfig] = useState<SyncConfigState>(defaultSyncConfig);

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
      setSyncUpConfig(fromSyncButtonConfig(project.sync_up_config));
      setSyncDownConfig(fromSyncButtonConfig(project.sync_down_config));
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
        syncUpConfig?: SyncButtonConfig | null;
        syncDownConfig?: SyncButtonConfig | null;
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

      // Include sync configs
      const newSyncUp = toSyncButtonConfig(syncUpConfig);
      const origSyncUp = project.sync_up_config;
      if (JSON.stringify(newSyncUp) !== JSON.stringify(origSyncUp)) {
        opts.syncUpConfig = newSyncUp;
      }

      const newSyncDown = toSyncButtonConfig(syncDownConfig);
      const origSyncDown = project.sync_down_config;
      if (JSON.stringify(newSyncDown) !== JSON.stringify(origSyncDown)) {
        opts.syncDownConfig = newSyncDown;
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="settings">
          <TabsList className="w-full">
            <TabsTrigger value="settings" className="flex-1">Project Settings</TabsTrigger>
            <TabsTrigger value="sync-up" className="flex-1">Sync Up</TabsTrigger>
            <TabsTrigger value="sync-down" className="flex-1">Sync Down</TabsTrigger>
          </TabsList>

          <TabsContent value="settings">
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
          </TabsContent>

          <TabsContent value="sync-up">
            <SyncConfigForm
              config={syncUpConfig}
              onChange={setSyncUpConfig}
              label="Sync Up Button"
            />
          </TabsContent>

          <TabsContent value="sync-down">
            <SyncConfigForm
              config={syncDownConfig}
              onChange={setSyncDownConfig}
              label="Sync Down Button"
            />
          </TabsContent>
        </Tabs>

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
