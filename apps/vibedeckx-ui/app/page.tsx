'use client';
import { useState, useEffect } from 'react';
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input';
import { Message, MessageContent } from '@/components/ai-elements/message';
import {
  Conversation,
  ConversationContent,
} from '@/components/ai-elements/conversation';
import { Loader } from '@/components/ai-elements/loader';
import { Suggestions, Suggestion } from '@/components/ai-elements/suggestion';
import { ProjectSelector } from '@/components/project/project-selector';
import { ProjectCard } from '@/components/project/project-card';
import { useProjects } from '@/hooks/use-projects';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { CreateProjectDialog } from '@/components/project/create-project-dialog';
import { ExecutorPanel } from '@/components/executor';

interface Chat {
  id: string;
  demo: string;
}

export default function Home() {
  const [message, setMessage] = useState('');
  const [currentChat, setCurrentChat] = useState<Chat | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<
    Array<{
      type: 'user' | 'assistant';
      content: string;
    }>
  >([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedWorktree, setSelectedWorktree] = useState(".");

  const {
    projects,
    currentProject,
    loading: projectsLoading,
    createProject,
    selectProject,
  } = useProjects();

  // Reset worktree selection when project changes
  useEffect(() => {
    setSelectedWorktree(".");
  }, [currentProject?.id]);

  const handleSendMessage = async (promptMessage: PromptInputMessage) => {
    const hasText = Boolean(promptMessage.text);
    const hasAttachments = Boolean(promptMessage.files?.length);

    if (!(hasText || hasAttachments) || isLoading) return;
    const userMessage = promptMessage.text?.trim() || 'Sent with attachments';
    setMessage('');
    setIsLoading(true);
    setChatHistory((prev) => [...prev, { type: 'user', content: userMessage }]);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          chatId: currentChat?.id,
        }),
      });
      if (!response.ok) {
        throw new Error('Failed to create chat');
      }
      const chat: Chat = await response.json();
      setCurrentChat(chat);
      setChatHistory((prev) => [
        ...prev,
        {
          type: 'assistant',
          content: 'Generated new app preview. Check the preview panel!',
        },
      ]);
    } catch (error) {
      console.error('Error:', error);
      setChatHistory((prev) => [
        ...prev,
        {
          type: 'assistant',
          content:
            'Sorry, there was an error creating your app. Please try again.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // 显示欢迎页面（无项目时）
  if (!projectsLoading && projects.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-6">
          <h1 className="text-4xl font-bold">Welcome to Vibedeckx</h1>
          <p className="text-muted-foreground">
            Create your first project to get started
          </p>
          <Button size="lg" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-5 w-5 mr-2" />
            Create Project
          </Button>
          <CreateProjectDialog
            open={createDialogOpen}
            onOpenChange={setCreateDialogOpen}
            onProjectCreated={createProject}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header with Project Selector */}
      <div className="border-b p-3 h-14 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Vibedeckx</h1>
        <ProjectSelector
          projects={projects}
          currentProject={currentProject}
          onSelectProject={selectProject}
          onCreateProject={createProject}
        />
      </div>

      <div className="flex-1 flex">
        {/* Chat Panel */}
        <div className="w-1/2 flex flex-col border-r">
          {/* Project Info */}
          {currentProject && (
            <div className="p-4 border-b">
              <ProjectCard
                project={currentProject}
                selectedWorktree={selectedWorktree}
                onWorktreeChange={setSelectedWorktree}
              />
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatHistory.length === 0 ? (
              <div className="text-center font-semibold mt-8">
                <p className="text-3xl mt-4">What can we build together?</p>
              </div>
            ) : (
              <>
                <Conversation>
                  <ConversationContent>
                    {chatHistory.map((msg, index) => (
                      <Message from={msg.type} key={index}>
                        <MessageContent>{msg.content}</MessageContent>
                      </Message>
                    ))}
                  </ConversationContent>
                </Conversation>
                {isLoading && (
                  <Message from="assistant">
                    <MessageContent>
                      <div className="flex items-center gap-2">
                        <Loader />
                        Creating your app...
                      </div>
                    </MessageContent>
                  </Message>
                )}
              </>
            )}
          </div>
          {/* Input */}
          <div className="border-t p-4">
            {!currentChat && (
              <Suggestions>
                <Suggestion
                  onClick={() =>
                    setMessage('Create a responsive navbar with Tailwind CSS')
                  }
                  suggestion="Create a responsive navbar with Tailwind CSS"
                />
                <Suggestion
                  onClick={() => setMessage('Build a todo app with React')}
                  suggestion="Build a todo app with React"
                />
                <Suggestion
                  onClick={() =>
                    setMessage('Make a landing page for a coffee shop')
                  }
                  suggestion="Make a landing page for a coffee shop"
                />
              </Suggestions>
            )}
            <div className="flex gap-2">
              <PromptInput
                onSubmit={handleSendMessage}
                className="mt-4 w-full max-w-2xl mx-auto relative"
              >
                <PromptInputTextarea
                  onChange={(e) => setMessage(e.target.value)}
                  value={message}
                  className="pr-12 min-h-[60px]"
                />
                <PromptInputSubmit
                  className="absolute bottom-1 right-1"
                  disabled={!message}
                  status={isLoading ? 'streaming' : 'ready'}
                />
              </PromptInput>
            </div>
          </div>
        </div>
        {/* Executor Panel */}
        <div className="w-1/2 flex flex-col">
          <ExecutorPanel
            projectId={currentProject?.id ?? null}
            selectedWorktree={selectedWorktree}
          />
        </div>
      </div>
    </div>
  );
}
