"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Trash2 } from "lucide-react";
import type { Command } from "@/lib/api";

interface CommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  command?: Command | null;
  onSave: (data: { name: string; content: string }) => void;
  onDelete?: (id: string) => void;
}

export function CommandDialog({ open, onOpenChange, command, onSave, onDelete }: CommandDialogProps) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    if (open) {
      setName(command?.name ?? "");
      setContent(command?.content ?? "");
    }
  }, [open, command]);

  const handleSave = () => {
    if (!name.trim() || !content.trim()) return;
    onSave({ name: name.trim(), content: content.trim() });
    onOpenChange(false);
  };

  const isEdit = !!command;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Command" : "Add Command"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Run tests"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Command</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="e.g. Run all unit tests and report any failures"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter className="flex justify-between">
          <div>
            {isEdit && onDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  onDelete(command!.id);
                  onOpenChange(false);
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!name.trim() || !content.trim()}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
