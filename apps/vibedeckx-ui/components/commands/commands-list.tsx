"use client";

import { useState, useImperativeHandle, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Play, Plus } from "lucide-react";
import { CommandDialog } from "./command-dialog";
import type { Command } from "@/lib/api";

export interface CommandsListHandle {
  openAdd: () => void;
}

interface CommandsListProps {
  commands: Command[];
  hideHeader?: boolean;
  onCreateCommand: (opts: { name: string; content: string }) => Promise<Command | null>;
  onUpdateCommand: (id: string, opts: { name?: string; content?: string }) => Promise<Command | null>;
  onDeleteCommand: (id: string) => Promise<void>;
  onExecuteCommand: (content: string) => void;
}

export const CommandsList = forwardRef<CommandsListHandle, CommandsListProps>(function CommandsList(
  { commands, hideHeader, onCreateCommand, onUpdateCommand, onDeleteCommand, onExecuteCommand },
  ref
) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCommand, setEditingCommand] = useState<Command | null>(null);

  useImperativeHandle(ref, () => ({
    openAdd: () => {
      setEditingCommand(null);
      setDialogOpen(true);
    },
  }));

  const handleAdd = () => {
    setEditingCommand(null);
    setDialogOpen(true);
  };

  const handleEdit = (command: Command) => {
    setEditingCommand(command);
    setDialogOpen(true);
  };

  const handleSave = async (data: { name: string; content: string }) => {
    if (editingCommand) {
      await onUpdateCommand(editingCommand.id, data);
    } else {
      await onCreateCommand(data);
    }
  };

  return (
    <div className={hideHeader ? undefined : "space-y-1"}>
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Commands</span>
          <Button variant="ghost" size="icon-sm" className="h-6 w-6" onClick={handleAdd} title="Add command">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      {commands.length === 0 ? (
        <button
          onClick={handleAdd}
          className="w-full text-center py-3 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          No commands yet. Click to add one.
        </button>
      ) : (
        <div className="space-y-0.5 max-h-48 overflow-y-auto">
          {commands.map((command) => (
            <div
              key={command.id}
              className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-muted/50 group"
            >
              <span
                className="text-sm truncate flex-1 cursor-pointer text-foreground"
                title={command.content}
                onClick={() => handleEdit(command)}
              >
                {command.name}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onExecuteCommand(command.content)}
                title="Execute command"
              >
                <Play className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <CommandDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        command={editingCommand}
        onSave={handleSave}
        onDelete={async (id) => { await onDeleteCommand(id); }}
      />
    </div>
  );
});
