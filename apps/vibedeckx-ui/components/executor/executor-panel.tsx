"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Terminal } from "lucide-react";
import { ExecutorItem } from "./executor-item";
import { ExecutorForm } from "./executor-form";
import { useExecutors } from "@/hooks/use-executors";
import { ExecutionModeToggle } from "@/components/ui/execution-mode-toggle";
import type { Project, ExecutionMode } from "@/lib/api";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type CollisionDetection,
  type DroppableContainer,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

interface ExecutorPanelProps {
  projectId: string | null;
  selectedWorktree?: string;
  project?: Project | null;
  onExecutorModeChange?: (mode: ExecutionMode) => void;
}

// Custom collision detection that only considers the header region (52px) of each item
const HEADER_HEIGHT = 52;

const headerOnlyCollision: CollisionDetection = (args) => {
  const { droppableContainers, pointerCoordinates } = args;

  if (!pointerCoordinates) {
    return closestCenter(args);
  }

  // Find containers where pointer is within the header region
  const collisions: { id: string; data: { droppableContainer: DroppableContainer } }[] = [];

  for (const container of droppableContainers) {
    const rect = container.rect.current;
    if (!rect) continue;

    // Check if pointer is within the header region (top HEADER_HEIGHT pixels)
    const headerTop = rect.top;
    const headerBottom = rect.top + HEADER_HEIGHT;

    if (
      pointerCoordinates.x >= rect.left &&
      pointerCoordinates.x <= rect.right &&
      pointerCoordinates.y >= headerTop &&
      pointerCoordinates.y <= headerBottom
    ) {
      collisions.push({
        id: container.id as string,
        data: { droppableContainer: container },
      });
    }
  }

  if (collisions.length > 0) {
    return collisions;
  }

  // Fallback: find the closest header region
  let closest: { id: string; distance: number; data: { droppableContainer: DroppableContainer } } | null = null;

  for (const container of droppableContainers) {
    const rect = container.rect.current;
    if (!rect) continue;

    const headerCenterY = rect.top + HEADER_HEIGHT / 2;
    const centerX = rect.left + rect.width / 2;
    const distance = Math.sqrt(
      Math.pow(pointerCoordinates.x - centerX, 2) +
      Math.pow(pointerCoordinates.y - headerCenterY, 2)
    );

    if (!closest || distance < closest.distance) {
      closest = {
        id: container.id as string,
        distance,
        data: { droppableContainer: container },
      };
    }
  }

  return closest ? [{ id: closest.id, data: closest.data }] : [];
};

export function ExecutorPanel({ projectId, selectedWorktree, project, onExecutorModeChange }: ExecutorPanelProps) {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = executors.findIndex((e) => e.id === active.id);
      const newIndex = executors.findIndex((e) => e.id === over.id);
      const newOrder = [...executors];
      const [moved] = newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, moved);
      reorderExecutors(newOrder.map((e) => e.id));
    }
  };

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
        <div className="flex items-center gap-2">
          <h2 className="font-semibold flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Executors
          </h2>
          {project && project.path && project.remote_path && onExecutorModeChange && (
            <ExecutionModeToggle
              mode={project.executor_mode}
              onModeChange={onExecutorModeChange}
            />
          )}
        </div>
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
              collisionDetection={headerOnlyCollision}
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
