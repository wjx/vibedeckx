"use client";

import { Conversation, ConversationContent } from "@/components/ai-elements/conversation";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { MessageSquare } from "lucide-react";

interface MainConversationProps {
  projectId: string | null;
}

export function MainConversation({ projectId }: MainConversationProps) {
  if (!projectId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Select a project to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-blue-500" />
          <span className="text-sm font-medium">Main Chat</span>
        </div>
      </div>

      {/* Messages area */}
      <Conversation className="flex-1 min-h-0" initial="instant">
        <ConversationContent className="gap-1 p-4">
          <div className="text-center py-12">
            <MessageSquare className="h-16 w-16 mx-auto mb-4 text-blue-500/30" />
            <h3 className="text-lg font-semibold mb-2">Start a conversation</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Chat with the AI assistant about your project
            </p>
          </div>
        </ConversationContent>
      </Conversation>

      {/* Input area */}
      <div className="flex-shrink-0 border-t p-4">
        <PromptInput
          onSubmit={() => {}}
          className="w-full"
        >
          <PromptInputTextarea
            disabled
            placeholder="(coming soon)"
            className="pr-12"
          />
          <PromptInputSubmit
            className="absolute bottom-1 right-1"
            disabled
          />
        </PromptInput>
      </div>
    </div>
  );
}
