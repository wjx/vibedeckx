import { useCallback, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

const MAX_HISTORY = 50;
const KEY_PREFIX = "vibedeckx:agent-input-history:";

function storageKey(projectId: string | null, branch: string | null): string | null {
  if (!projectId || !branch) return null;
  return `${KEY_PREFIX}${projectId}:${branch}`;
}

function readHistory(key: string | null): string[] {
  if (!key || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

function writeHistory(key: string | null, history: string[]): void {
  if (!key || typeof window === "undefined") return;
  try {
    if (history.length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(history));
  } catch {
    // ignore quota / privacy-mode errors
  }
}

/**
 * Provides terminal-style up/down arrow history navigation for a text input.
 * - ArrowUp (when cursor is at position 0): recalls previous sent message
 * - ArrowDown (when cursor is at end): recalls next sent message or restores draft
 *
 * History is scoped per workspace (projectId, branch) and persisted to localStorage.
 */
export function useInputHistory(
  setInput: (value: string) => void,
  projectId: string | null,
  branch: string | null
) {
  const currentKey = storageKey(projectId, branch);

  const historyRef = useRef<string[]>(readHistory(currentKey));
  const cursorRef = useRef(-1); // -1 = not navigating history
  const draftRef = useRef(""); // saves current input when history navigation starts
  const [loadedKey, setLoadedKey] = useState<string | null>(currentKey);

  // Reload history during render when the active workspace changes.
  // Reset navigation state so we don't leak cursor/draft across workspaces.
  if (loadedKey !== currentKey) {
    setLoadedKey(currentKey);
    historyRef.current = readHistory(currentKey);
    cursorRef.current = -1;
    draftRef.current = "";
  }

  const push = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const history = historyRef.current;
      // Skip duplicate of the most recent entry
      if (history.length > 0 && history[history.length - 1] === trimmed) {
        cursorRef.current = -1;
        return;
      }
      history.push(trimmed);
      if (history.length > MAX_HISTORY) {
        history.shift();
      }
      cursorRef.current = -1;
      writeHistory(currentKey, history);
    },
    [currentKey]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = e.currentTarget;
      const history = historyRef.current;
      if (history.length === 0) return;

      if (e.key === "ArrowUp") {
        // Only intercept when cursor is at position 0 (start of text)
        if (textarea.selectionStart !== 0 || textarea.selectionEnd !== 0) return;

        e.preventDefault();

        if (cursorRef.current === -1) {
          // Starting history navigation — save current draft
          draftRef.current = textarea.value;
          cursorRef.current = history.length - 1;
        } else if (cursorRef.current > 0) {
          cursorRef.current--;
        } else {
          return; // already at oldest entry
        }

        setInput(history[cursorRef.current]);
      } else if (e.key === "ArrowDown") {
        if (cursorRef.current === -1) return; // not navigating history

        // Only intercept when cursor is at the end of text
        const len = textarea.value.length;
        if (textarea.selectionStart !== len || textarea.selectionEnd !== len) return;

        e.preventDefault();

        if (cursorRef.current < history.length - 1) {
          cursorRef.current++;
          setInput(history[cursorRef.current]);
        } else {
          // Past newest entry — restore draft
          cursorRef.current = -1;
          setInput(draftRef.current);
        }
      } else {
        // Any other key resets history navigation cursor
        // (user started editing, so they're done navigating)
        if (cursorRef.current !== -1) {
          cursorRef.current = -1;
        }
      }
    },
    [setInput]
  );

  return { push, handleKeyDown };
}
