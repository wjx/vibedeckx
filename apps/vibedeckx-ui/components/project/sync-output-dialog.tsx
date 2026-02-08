"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import type { SyncExecutionResult } from "@/lib/api";

interface SyncOutputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  syncType: "up" | "down";
  result: SyncExecutionResult | null;
  loading: boolean;
}

export function SyncOutputDialog({
  open,
  onOpenChange,
  syncType,
  result,
  loading,
}: SyncOutputDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Sync {syncType === "up" ? "Up" : "Down"} Output
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {loading && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Running command...</span>
            </div>
          )}

          {result && (
            <>
              <div className="flex items-center gap-2">
                {result.success ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
                <span className="text-sm">
                  Exit code: {result.exitCode}
                </span>
              </div>

              {result.stdout && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">stdout</label>
                  <pre className="text-xs bg-muted rounded-md p-3 overflow-auto max-h-48 whitespace-pre-wrap break-all">
                    {result.stdout}
                  </pre>
                </div>
              )}

              {result.stderr && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">stderr</label>
                  <pre className="text-xs bg-muted rounded-md p-3 overflow-auto max-h-48 whitespace-pre-wrap break-all text-red-400">
                    {result.stderr}
                  </pre>
                </div>
              )}

              {!result.stdout && !result.stderr && (
                <p className="text-sm text-muted-foreground">No output</p>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
