"use client";

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { useAgentSession } from "@/hooks/use-agent-session";
import { AgentMessageItem } from "./agent-message";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Loader } from "@/components/ai-elements/loader";
import { Bot, Square, AlertCircle, Wifi, WifiOff } from "lucide-react";

interface AgentConversationProps {
  projectId: string | null;
  worktreePath: string;
}

export interface AgentConversationHandle {
  submitMessage: (content: string) => Promise<void>;
}

export const AgentConversation = forwardRef<AgentConversationHandle, AgentConversationProps>(
  function AgentConversation({ projectId, worktreePath }, ref) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    session,
    messages,
    isConnected,
    isLoading,
    error,
    startSession,
    sendMessage,
  } = useAgentSession(projectId, worktreePath);

  useImperativeHandle(ref, () => ({
    submitMessage: async (content: string) => {
      if (!session) {
        const newSession = await startSession();
        if (newSession) {
          sendMessage(content, newSession.id);
        }
      } else {
        sendMessage(content);
      }
    }
  }), [session, startSession, sendMessage]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async () => {
    if (!input.trim()) return;

    const content = input.trim();
    setInput("");

    if (!session) {
      // Start session with first message
      const newSession = await startSession();
      if (newSession) {
        // Use returned session ID directly to avoid React state timing issues
        sendMessage(content, newSession.id);
      }
    } else {
      sendMessage(content);
    }
  };

  // No project selected
  if (!projectId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Select a project to start coding with Claude</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-medium">Claude Code</span>
          {session && (
            <span
              className={`flex items-center gap-1 text-xs ${
                isConnected ? "text-green-500" : "text-muted-foreground"
              }`}
            >
              {isConnected ? (
                <>
                  <Wifi className="h-3 w-3" />
                  Connected
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" />
                  Disconnected
                </>
              )}
            </span>
          )}
        </div>
        {session && session.status === "running" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              // TODO: Implement stop
            }}
            className="h-7 text-xs"
          >
            <Square className="h-3 w-3 mr-1" />
            Stop
          </Button>
        )}
      </div>

      {/* Messages area */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4">
          {!session && messages.length === 0 ? (
            <div className="text-center py-12">
              <Bot className="h-16 w-16 mx-auto mb-4 text-violet-500/30" />
              <h3 className="text-lg font-semibold mb-2">Start a conversation</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Ask Claude to help you with coding tasks in this worktree
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {messages.map((msg, index) => (
                <AgentMessageItem key={index} message={msg} />
              ))}
              {isLoading && (
                <div className="flex items-center gap-2 py-4 text-muted-foreground">
                  <Loader className="h-4 w-4" />
                  <span className="text-sm">Claude is thinking...</span>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 rounded-lg text-red-500 text-sm mt-4">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="flex-shrink-0 border-t p-4">
        <PromptInput
          onSubmit={() => handleSubmit()}
          className="w-full"
        >
          <PromptInputTextarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              session
                ? "Ask Claude to help with your code..."
                : "Type your first message to start..."
            }
            className="pr-12"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <PromptInputSubmit
            className="absolute top-1 right-1"
            disabled={!input.trim()}
            status={isLoading ? "streaming" : "ready"}
          />
        </PromptInput>
      </div>
    </div>
  );
});
