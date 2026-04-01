"use client";

import { MessageItem, Message } from "./message-item";
import { ToolCall } from "./tool-call";
import { EmptyState } from "./empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEffect, useRef } from "react";

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  onSelectSuggestion: (text: string) => void;
}

export function MessageList({ messages, isLoading, onSelectSuggestion }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <EmptyState onSelectSuggestion={onSelectSuggestion} />
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 p-4 md:p-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-6 pb-24">
        {messages.map((msg, idx) => {
          if (msg.type === "tool_call") {
            return (
              <ToolCall
                key={idx}
                name={msg.toolName || "tool"}
                input={msg.toolInput}
                output={msg.toolOutput}
              />
            );
          }
          return (
            <MessageItem
              key={idx}
              message={msg}
              isLast={idx === messages.length - 1}
              isLoading={isLoading}
            />
          );
        })}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
