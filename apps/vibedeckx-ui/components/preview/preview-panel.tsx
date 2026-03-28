"use client";

import { type ReactNode, useState, useCallback, useEffect } from "react";
import { Globe, RefreshCw, ExternalLink } from "lucide-react";
import {
  WebPreview,
  WebPreviewBody,
  WebPreviewNavigation,
  WebPreviewNavigationButton,
  WebPreviewUrl,
} from "@/components/ai-elements/web-preview";
import type { Project } from "@/lib/api";

interface PreviewPanelProps {
  projectId: string | null;
  selectedBranch?: string | null;
  project?: Project | null;
}

function usePersistedUrl(projectId: string | null, branch: string | null | undefined): [string, (url: string) => void] {
  const key = `vibedeckx:previewUrl:${projectId ?? 'none'}:${branch ?? 'main'}`;
  const [url, setUrlState] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem(key) ?? '';
  });

  useEffect(() => {
    const saved = localStorage.getItem(key);
    setUrlState(saved ?? '');
  }, [key]);

  const setUrl = useCallback((newUrl: string) => {
    setUrlState(newUrl);
    localStorage.setItem(key, newUrl);
  }, [key]);

  return [url, setUrl];
}

export function PreviewPanel({ projectId, selectedBranch }: PreviewPanelProps) {
  const [url, setUrl] = usePersistedUrl(projectId, selectedBranch);
  const [iframeKey, setIframeKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setIframeKey((k) => k + 1);
  }, []);

  const handleOpenExternal = useCallback(() => {
    if (url) window.open(url, '_blank');
  }, [url]);

  return (
    <div className="h-full flex flex-col">
      <WebPreview defaultUrl={url} onUrlChange={setUrl} className="h-full">
        <WebPreviewNavigation className="h-10 p-1.5 gap-0.5">
          <WebPreviewNavigationButton tooltip="Refresh" onClick={handleRefresh}>
            <RefreshCw className="h-3.5 w-3.5" />
          </WebPreviewNavigationButton>
          <WebPreviewNavigationButton tooltip="Open in browser" onClick={handleOpenExternal}>
            <ExternalLink className="h-3.5 w-3.5" />
          </WebPreviewNavigationButton>
          <WebPreviewUrl className="h-7 text-xs" />
        </WebPreviewNavigation>
        {url ? (
          <WebPreviewBody key={iframeKey} className="bg-white" />
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
