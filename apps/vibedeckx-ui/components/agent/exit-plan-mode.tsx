"use client";

import { useState, useCallback } from "react";
import { useAgentConversation } from "./agent-conversation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageResponse } from "@/components/ai-elements/message";
import { CheckCircle2, Play, MessageSquare, Loader2 } from "lucide-react";

interface ExitPlanModeUIProps {
  input: unknown;
  messageIndex: number;
}

function extractPlanContent(input: unknown, messages: { type: string; content?: string; tool?: string; input?: unknown }[]): string {
  // 1. Check ExitPlanMode tool input for plan field
  const inputObj = typeof input === "string" ? tryParse(input) : input;
  if (inputObj && typeof inputObj === "object" && "plan" in (inputObj as Record<string, unknown>)) {
    const plan = (inputObj as Record<string, string>).plan;
    if (plan) return plan;
  }

  // 2. Search backwards through messages for Write tool_use with .claude/plans/ path
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type === "tool_use" && msg.tool === "Write") {
      const writeInput = typeof msg.input === "string" ? tryParse(msg.input) : msg.input;
      if (writeInput && typeof writeInput === "object") {
        const wi = writeInput as Record<string, string>;
        if (wi.file_path?.includes(".claude/plans/") && wi.content) {
          return wi.content;
        }
      }
    }
  }

  // 3. Fallback
  return "Plan written to file";
}

function tryParse(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

export function ExitPlanModeUI({ input, messageIndex }: ExitPlanModeUIProps) {
  const { messages, acceptPlan, permissionMode } = useAgentConversation();
  const [isExpanded, setIsExpanded] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);

  const planContent = extractPlanContent(input, messages);

  const handleAccept = useCallback(async () => {
    setIsAccepting(true);
    try {
      await acceptPlan(planContent);
    } finally {
      setIsAccepting(false);
    }
  }, [acceptPlan, planContent]);

  // Determine if already responded: next message is a user message
  const nextMsg = messages[messageIndex + 1];
  const isResponded = nextMsg?.type === "user";
  const respondedText = isResponded ? nextMsg.content : "";

  // Check if plan was accepted (mode switched to edit after this message)
  const isPlanAccepted = isResponded && permissionMode === "edit";

  if (isResponded) {
    return (
      <div className="space-y-2 mt-2">
        {isPlanAccepted ? (
          <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-white">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Plan Accepted
          </Badge>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Feedback sent: {respondedText.length > 100 ? respondedText.substring(0, 100) + "..." : respondedText}</span>
          </div>
        )}
        <details open={!isPlanAccepted}>
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            View Plan
          </summary>
          <div className="mt-2 rounded-lg border p-3 bg-muted/30">
            <div className="text-sm prose prose-sm dark:prose-invert max-w-none break-words [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_code]:break-all [&_p]:break-words">
              <MessageResponse>{planContent}</MessageResponse>
            </div>
          </div>
        </details>
      </div>
    );
  }

  // Interactive state: not yet responded
  return (
    <div className="space-y-3 mt-2">
      {/* Plan content */}
      <div className="rounded-lg border p-3 bg-card">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-muted-foreground cursor-pointer hover:text-foreground mb-2 block"
        >
          {isExpanded ? "Collapse" : "Expand"} Plan
        </button>
        {isExpanded && (
          <div className="text-sm prose prose-sm dark:prose-invert max-w-none break-words [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_code]:break-all [&_p]:break-words max-h-96 overflow-y-auto">
            <MessageResponse>{planContent}</MessageResponse>
          </div>
        )}
      </div>

      {/* Accept button only - feedback goes through the normal conversation input */}
      <Button
        onClick={handleAccept}
        disabled={isAccepting}
        className="bg-green-600 hover:bg-green-700 text-white"
        size="sm"
      >
        {isAccepting ? (
          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
        ) : (
          <Play className="h-3.5 w-3.5 mr-1.5" />
        )}
        {isAccepting ? "Accepting Plan..." : "Accept Plan & Start Editing"}
      </Button>
    </div>
  );
}
