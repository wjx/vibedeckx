"use client";

import { cn } from "@/lib/utils";
import { Bot, User, Wrench, Brain, AlertCircle, Info } from "lucide-react";
import type { AgentMessage } from "@/hooks/use-agent-session";

interface AgentMessageProps {
  message: AgentMessage;
}

export function AgentMessageItem({ message }: AgentMessageProps) {
  switch (message.type) {
    case "user":
      return <UserMessage content={message.content} />;

    case "assistant":
      return <AssistantMessage content={message.content} />;

    case "tool_use":
      return <ToolUseMessage tool={message.tool} input={message.input} />;

    case "tool_result":
      return <ToolResultMessage tool={message.tool} output={message.output} />;

    case "thinking":
      return <ThinkingMessage content={message.content} />;

    case "error":
      return <ErrorMessage message={message.message} />;

    case "system":
      return <SystemMessage content={message.content} />;

    default:
      return null;
  }
}

function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex gap-3 py-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
        <User className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground mb-1">You</p>
        <div className="text-sm text-foreground whitespace-pre-wrap">{content}</div>
      </div>
    </div>
  );
}

function AssistantMessage({ content }: { content: string }) {
  return (
    <div className="flex gap-3 py-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center">
        <Bot className="w-4 h-4 text-violet-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-violet-500 mb-1">Claude</p>
        <div className="text-sm text-foreground whitespace-pre-wrap">{content}</div>
      </div>
    </div>
  );
}

function ToolUseMessage({ tool, input }: { tool: string; input: unknown }) {
  const inputStr = typeof input === "string" ? input : JSON.stringify(input, null, 2);
  const isExpanded = inputStr.length > 200;

  return (
    <div className="flex gap-3 py-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center">
        <Wrench className="w-4 h-4 text-amber-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-500 mb-1">Tool: {tool}</p>
        <details className={cn(!isExpanded && "open")}>
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            Input
          </summary>
          <pre className="mt-1 text-xs bg-muted/50 p-2 rounded overflow-x-auto">
            {inputStr.length > 500 ? inputStr.substring(0, 500) + "..." : inputStr}
          </pre>
        </details>
      </div>
    </div>
  );
}

function ToolResultMessage({ tool, output }: { tool: string; output: string }) {
  const isLong = output.length > 200;

  return (
    <div className="flex gap-3 py-3 pl-11">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground mb-1">Result{tool ? ` (${tool})` : ""}</p>
        <details className={cn(!isLong && "open")}>
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            Output
          </summary>
          <pre className="mt-1 text-xs bg-muted/50 p-2 rounded overflow-x-auto max-h-48 overflow-y-auto">
            {output.length > 1000 ? output.substring(0, 1000) + "..." : output}
          </pre>
        </details>
      </div>
    </div>
  );
}

function ThinkingMessage({ content }: { content: string }) {
  return (
    <div className="flex gap-3 py-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
        <Brain className="w-4 h-4 text-blue-500" />
      </div>
      <div className="flex-1 min-w-0">
        <details>
          <summary className="text-sm font-medium text-blue-500 cursor-pointer hover:underline">
            Thinking...
          </summary>
          <div className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap bg-blue-500/5 p-2 rounded">
            {content.length > 500 ? content.substring(0, 500) + "..." : content}
          </div>
        </details>
      </div>
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="flex gap-3 py-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center">
        <AlertCircle className="w-4 h-4 text-red-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-red-500 mb-1">Error</p>
        <p className="text-sm text-red-500/80">{message}</p>
      </div>
    </div>
  );
}

function SystemMessage({ content }: { content: string }) {
  return (
    <div className="flex gap-3 py-2">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-500/10 flex items-center justify-center">
        <Info className="w-4 h-4 text-gray-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{content}</p>
      </div>
    </div>
  );
}
