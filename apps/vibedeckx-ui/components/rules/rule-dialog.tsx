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
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2 } from "lucide-react";
import type { Rule } from "@/lib/api";

interface RuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule?: Rule | null;
  onSave: (data: { name: string; content: string; enabled: boolean }) => void;
  onDelete?: (id: string) => void;
}

export function RuleDialog({ open, onOpenChange, rule, onSave, onDelete }: RuleDialogProps) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (open) {
      setName(rule?.name ?? "");
      setContent(rule?.content ?? "");
      setEnabled(rule ? rule.enabled === 1 : true);
    }
  }, [open, rule]);

  const handleSave = () => {
    if (!name.trim() || !content.trim()) return;
    onSave({ name: name.trim(), content: content.trim(), enabled });
    onOpenChange(false);
  };

  const isEdit = !!rule;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Rule" : "Add Rule"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Auto-commit on finish"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Rule</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="e.g. When the coding agent finishes, run git commit executor"
              rows={3}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="rule-enabled"
              checked={enabled}
              onCheckedChange={(checked) => setEnabled(checked === true)}
            />
            <label htmlFor="rule-enabled" className="text-sm">Enabled</label>
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
                  onDelete(rule!.id);
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
