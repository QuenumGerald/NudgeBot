"use client";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
  type?: "text" | "tool_call";
  toolName?: string;
  toolInput?: string;
  toolOutput?: string;
}

interface MessageItemProps {
  message: Message;
  isLast: boolean;
  isLoading: boolean;
}

export function MessageItem({ message, isLast, isLoading }: MessageItemProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex w-full gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && (
        <Avatar className="w-8 h-8 border border-border bg-bg-3 shadow-sm mt-1">
          <AvatarFallback className="bg-transparent">🤖</AvatarFallback>
        </Avatar>
      )}

      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed",
          isUser
            ? "bg-gradient-to-br from-accent to-accent-2 text-white shadow-md"
            : "bg-bg-3 border border-border text-text shadow-sm"
        )}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : (
          <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-bg-4 prose-pre:border prose-pre:border-border">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
            {isLast && isLoading && (
              <span className="inline-block animate-pulse ml-1 align-middle">▋</span>
            )}
          </div>
        )}
      </div>

      {isUser && (
        <Avatar className="w-8 h-8 border border-accent/20 bg-accent/10 shadow-sm mt-1">
          <AvatarFallback className="bg-transparent text-accent text-xs">👤</AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
