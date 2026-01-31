"use client";

import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { LogMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ExecutorOutputProps {
  logs: LogMessage[];
  className?: string;
}

export function ExecutorOutput({ logs, className }: ExecutorOutputProps) {
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
