"use client";

import { useState } from "react";
import { ChevronRight, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolCallProps {
  name: string;
  input?: string;
  output?: string;
}

export function ToolCall({ name, input, output }: ToolCallProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex flex-col gap-1 w-full animate-in fade-in zoom-in-95 duration-200 ml-12 mb-4 max-w-[80%]">
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer bg-bg-3 border-l-2 border-accent hover:bg-bg-4 transition-colors",
          isOpen ? "rounded-b-none border-b-0" : "shadow-sm border border-border"
        )}
        onClick={() => setIsOpen(!isOpen)}
      >
        <Settings size={14} className="text-accent animate-spin-slow" />
        <span className="text-xs font-mono text-text-2 font-semibold">
          {name}(<span className="text-accent-2 truncate max-w-[150px] inline-block align-bottom">{input || "..."}</span>)
        </span>
        <ChevronRight
          size={14}
          className={cn("ml-auto text-text-3 transition-transform", isOpen && "rotate-90")}
        />
      </div>

      {isOpen && (
        <div className="bg-bg-4 border border-border border-t-0 border-l-2 border-l-accent rounded-b-lg p-3 text-xs font-mono text-text-3 max-h-40 overflow-y-auto whitespace-pre-wrap">
          {output || <span className="animate-pulse">Exécution en cours...</span>}
        </div>
      )}
    </div>
  );
}
