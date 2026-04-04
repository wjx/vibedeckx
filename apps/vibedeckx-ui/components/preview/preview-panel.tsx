"use client";

import { useState, useCallback, useEffect } from "react";
import { Globe, RefreshCw, ExternalLink, Play, Square, Loader2 } from "lucide-react";
import {
  WebPreview,
  WebPreviewBody,
  WebPreviewNavigation,
  WebPreviewNavigationButton,
  WebPreviewUrl,
} from "@/components/ai-elements/web-preview";
import { api } from "@/lib/api";
import type { Project } from "@/lib/api";

interface PreviewPanelProps {
  projectId: string | null;
  selectedBranch?: string | null;
  project?: Project | null;
}

type BrowserState = "idle" | "connecting" | "running" | "error";

function usePersistedUrl(projectId: string | null, branch: string | null | undefined): [string, (url: string) => void] {
  const key = `vibedeckx:previewUrl:${projectId ?? "none"}:${branch ?? "main"}`;
  const [url, setUrlState] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(key) ?? "";
  });

  useEffect(() => {
    const saved = localStorage.getItem(key);
    setUrlState(saved ?? "");
  }, [key]);

  const setUrl = useCallback(
    (newUrl: string) => {
      setUrlState(newUrl);
      localStorage.setItem(key, newUrl);
    },
    [key],
  );

  return [url, setUrl];
}

export function PreviewPanel({ projectId, selectedBranch }: PreviewPanelProps) {
  const [url, setUrl] = usePersistedUrl(projectId, selectedBranch);
  const [iframeKey, setIframeKey] = useState(0);
  const [browserState, setBrowserState] = useState<BrowserState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Check for existing browser session on mount / project change
  useEffect(() => {
    if (!projectId) return;
    api.getBrowserStatus(projectId).then((status) => {
      if (status && status.status === "running") {
        setBrowserState("running");
        if (status.url && !url) {
          setUrl(status.url);
        }
      }
    }).catch(() => { /* no session */ });
  }, [projectId]);

  // Listen for error postMessages from the proxied iframe
  useEffect(() => {
    if (!projectId) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "vibedeckx-browser-error" && event.data.projectId === projectId) {
        api.reportBrowserError(projectId, event.data.error).catch(() => {});
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [projectId]);

  const handleStart = useCallback(async () => {
    if (!projectId || !url) return;
    setBrowserState("connecting");
    setErrorMsg(null);
    try {
      await api.startBrowser(projectId, selectedBranch ?? undefined);
      setBrowserState("running");
      setIframeKey((k) => k + 1);
    } catch (err) {
      setBrowserState("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to start browser");
    }
  }, [projectId, url, selectedBranch]);

  const handleStop = useCallback(async () => {
    if (!projectId) return;
    try {
      await api.stopBrowser(projectId);
    } catch { /* ignore */ }
    setBrowserState("idle");
  }, [projectId]);

  const handleRefresh = useCallback(() => {
    setIframeKey((k) => k + 1);
  }, []);

  const handleOpenExternal = useCallback(() => {
    if (url) window.open(url, "_blank");
  }, [url]);

  const handleUrlSubmit = useCallback(
    (newUrl: string) => {
      setUrl(newUrl);
      if (browserState === "running") {
        // Reload iframe with new URL
        setIframeKey((k) => k + 1);
      }
    },
    [browserState, setUrl],
  );

  // Build the proxied iframe src
  const iframeSrc =
    browserState === "running" && url && projectId
      ? api.getBrowserProxyUrl(projectId, url)
      : undefined;

  return (
    <div className="h-full flex flex-col">
      <WebPreview defaultUrl={url} onUrlChange={handleUrlSubmit} className="h-full">
        <WebPreviewNavigation className="h-10 p-1.5 gap-0.5">
          {browserState === "running" ? (
            <WebPreviewNavigationButton tooltip="Stop browser" onClick={handleStop}>
              <Square className="h-3.5 w-3.5" />
            </WebPreviewNavigationButton>
          ) : (
            <WebPreviewNavigationButton
              tooltip="Start browser"
              onClick={handleStart}
              disabled={!url || !projectId || browserState === "connecting"}
            >
              {browserState === "connecting" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
            </WebPreviewNavigationButton>
          )}
          <WebPreviewNavigationButton tooltip="Refresh" onClick={handleRefresh} disabled={browserState !== "running"}>
            <RefreshCw className="h-3.5 w-3.5" />
          </WebPreviewNavigationButton>
          <WebPreviewNavigationButton tooltip="Open in browser" onClick={handleOpenExternal} disabled={!url}>
            <ExternalLink className="h-3.5 w-3.5" />
          </WebPreviewNavigationButton>
          <WebPreviewUrl className="h-7 text-xs" />
        </WebPreviewNavigation>

        {browserState === "running" && iframeSrc ? (
          <WebPreviewBody key={iframeKey} src={iframeSrc} className="bg-white" />
        ) : browserState === "connecting" ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 opacity-40 animate-spin" />
              <p className="text-sm">Starting browser...</p>
            </div>
          </div>
        ) : browserState === "error" ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <Globe className="h-8 w-8 opacity-40 text-destructive" />
              <p className="text-sm text-destructive">{errorMsg || "Browser error"}</p>
              <button
                onClick={() => { setBrowserState("idle"); setErrorMsg(null); }}
                className="text-xs underline hover:text-foreground"
              >
                Try again
              </button>
            </div>
          </div>
        ) : url ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <Play className="h-8 w-8 opacity-40" />
              <p className="text-sm">Press play to start the browser preview</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="flex flex-col items-center gap-2">
              <Globe className="h-8 w-8 opacity-40" />
              <p className="text-sm">Enter a URL above to preview</p>
            </div>
          </div>
        )}
      </WebPreview>
    </div>
  );
}
