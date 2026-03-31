"use client";

import { useRef, useEffect, KeyboardEvent } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  input: string;
  isLoading: boolean;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
}

export function ChatInput({ input, isLoading, onInputChange, onSubmit }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        onSubmit();
      }
    }
  };

  return (
    <div className="p-4 border-t border-border bg-bg-2">
      <div className="max-w-3xl mx-auto flex flex-col gap-3">
        <div
          className="relative flex items-end w-full rounded-2xl bg-bg-3 border border-border focus-within:border-accent/50 focus-within:ring-1 focus-within:ring-accent/50 transition-all p-1.5 shadow-sm"
        >
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={onInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Écris un message..."
            disabled={isLoading}
            className="min-h-[44px] max-h-[160px] w-full resize-none bg-transparent border-0 focus-visible:ring-0 text-text p-3 text-base shadow-none scrollbar-thin overflow-y-auto"
            rows={1}
          />
          <Button
            onClick={() => {
              if (input.trim() && !isLoading) {
                onSubmit();
              }
            }}
            disabled={!input.trim() || isLoading}
            size="icon"
            className={cn(
              "absolute bottom-2 right-2 h-8 w-8 rounded-xl shrink-0 transition-all duration-200",
              input.trim() && !isLoading
                ? "bg-gradient-to-br from-accent to-accent-2 hover:opacity-90 text-white shadow-md shadow-accent/20"
                : "bg-bg-4 text-text-3"
            )}
          >
            <ArrowUp size={16} strokeWidth={3} />
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 justify-center pb-2">
          {["Résumé GitHub", "Agenda du jour", "Crée un fichier", "Mémoire"].map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => onInputChange({ target: { value: chip } } as any)}
              className="text-xs px-3 py-1.5 rounded-full bg-bg-3 border border-border text-text-2 hover:bg-bg-4 hover:text-accent transition-colors"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
