"use client";

import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import type { LogMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ExecutorOutputProps {
  logs: LogMessage[];
  isPty: boolean;
  className?: string;
  onInput?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
}

export function ExecutorOutput({
  logs,
  isPty,
  className,
  onInput,
  onResize,
}: ExecutorOutputProps) {
  if (isPty) {
    return (
      <PtyOutput
        logs={logs}
        className={className}
        onInput={onInput}
        onResize={onResize}
      />
    );
  }

  return <RegularOutput logs={logs} className={className} />;
}

// PTY mode output using xterm.js
function PtyOutput({
  logs,
  className,
  onInput,
  onResize,
}: {
  logs: LogMessage[];
  className?: string;
  onInput?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastLogIndexRef = useRef(0);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: "#09090b",
        foreground: "#fafafa",
        cursor: "#fafafa",
        cursorAccent: "#09090b",
        selectionBackground: "#3f3f46",
        black: "#09090b",
        red: "#f87171",
        green: "#4ade80",
        yellow: "#facc15",
        blue: "#60a5fa",
        magenta: "#c084fc",
        cyan: "#22d3ee",
        white: "#fafafa",
        brightBlack: "#71717a",
        brightRed: "#fca5a5",
        brightGreen: "#86efac",
        brightYellow: "#fde047",
        brightBlue: "#93c5fd",
        brightMagenta: "#d8b4fe",
        brightCyan: "#67e8f9",
        brightWhite: "#ffffff",
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);

    terminal.open(containerRef.current);

    // Delay fit to ensure container is ready
    setTimeout(() => {
      try {
        fitAddon.fit();
        onResize?.(terminal.cols, terminal.rows);
      } catch {
        // Ignore fit errors
      }
    }, 0);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Handle user input
    terminal.onData((data) => {
      onInput?.(data);
    });

    // Handle resize
    terminal.onResize(({ cols, rows }) => {
      onResize?.(cols, rows);
    });

    return () => {
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      lastLogIndexRef.current = 0;
    };
  }, [onInput, onResize]);

  // Write new logs to terminal
  useEffect(() => {
    if (!terminalRef.current) return;

    // Only write new logs since last update
    for (let i = lastLogIndexRef.current; i < logs.length; i++) {
      const log = logs[i];
      if (log.type === "pty") {
        terminalRef.current.write(log.data);
      }
    }
    lastLogIndexRef.current = logs.length;
  }, [logs]);

  // Handle container resize
  useEffect(() => {
    if (!containerRef.current || !fitAddonRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddonRef.current?.fit();
      } catch {
        // Ignore resize errors
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn("h-[300px] rounded-md border bg-zinc-950 overflow-hidden", className)}
    />
  );
}

// Regular output for non-PTY mode
function RegularOutput({
  logs,
  className,
}: {
  logs: LogMessage[];
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAutoScrollRef = useRef(true);

  // Handle auto-scroll
  useEffect(() => {
    if (isAutoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  // Detect manual scroll
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isAtBottom =
      target.scrollHeight - target.scrollTop - target.clientHeight < 50;
    isAutoScrollRef.current = isAtBottom;
  };

  return (
    <ScrollArea
      className={cn("h-[300px] rounded-md border bg-zinc-950", className)}
    >
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="p-3 font-mono text-sm overflow-auto h-full"
      >
        {logs.length === 0 ? (
          <div className="text-zinc-500 italic">No output yet...</div>
        ) : (
          logs.map((log, index) => (
            <div
              key={index}
              className={cn(
                "whitespace-pre-wrap break-all",
                log.type === "stderr" && "text-red-400",
                log.type === "stdout" && "text-zinc-100"
              )}
            >
              {log.type === "stdout" || log.type === "stderr" ? log.data : null}
            </div>
          ))
        )}
      </div>
    </ScrollArea>
  );
}
