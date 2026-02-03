"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Terminal } from "lucide-react";
import { ExecutorItem } from "./executor-item";
import { ExecutorForm } from "./executor-form";
import { useExecutors } from "@/hooks/use-executors";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

interface ExecutorPanelProps {
  projectId: string | null;
  selectedWorktree?: string;
}

export function ExecutorPanel({ projectId, selectedWorktree }: ExecutorPanelProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const {
    executors,
    loading,
    createExecutor,
    updateExecutor,
    deleteExecutor,
    startExecutor,
    stopExecutor,
    markProcessFinished,
    reorderExecutors,
  } = useExecutors(projectId);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (over && active.id !== over.id) {
      const oldIndex = executors.findIndex((e) => e.id === active.id);
      const newIndex = executors.findIndex((e) => e.id === over.id);
      const newOrder = [...executors];
      const [moved] = newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, moved);
      reorderExecutors(newOrder.map((e) => e.id));
    }
  };

  const activeExecutor = activeId ? executors.find((e) => e.id === activeId) : null;

  if (!projectId) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Terminal className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Select a project to manage executors</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-4 border-b h-14">
        <h2 className="font-semibold flex items-center gap-2">
          <Terminal className="h-5 w-5" />
          Executors
        </h2>
        <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </div>

      <ScrollArea className="flex-1 overflow-hidden">
        <div className="p-4 space-y-3">
          {loading ? (
            <div className="text-center text-muted-foreground py-8">
              Loading executors...
            </div>
          ) : executors.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <p>No executors configured</p>
              <p className="text-sm mt-1">
                Add an executor to run commands like &quot;npm run dev&quot;
              </p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={pointerWithin}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={executors.map((e) => e.id)}
                strategy={verticalListSortingStrategy}
              >
                {executors.map((executor) => (
                  <ExecutorItem
                    key={executor.id}
                    executor={executor}
                    onStart={() => startExecutor(executor.id, selectedWorktree)}
                    onStop={(processId) => stopExecutor(executor.id, processId || executor.currentProcessId || undefined)}
                    onUpdate={(data) => updateExecutor(executor.id, data)}
                    onDelete={() => deleteExecutor(executor.id)}
                    onProcessFinished={() => markProcessFinished(executor.id)}
                  />
                ))}
              </SortableContext>
              <DragOverlay>
                {activeExecutor ? (
                  <div className="border rounded-lg bg-background shadow-lg p-3">
                    <span className="font-medium">{activeExecutor.name}</span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </div>
      </ScrollArea>

      <ExecutorForm
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={async (data) => {
          await createExecutor(data);
        }}
      />
    </div>
  );
}
