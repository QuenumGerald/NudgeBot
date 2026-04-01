"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { MessageSquare } from "lucide-react";

interface Session {
  session_id: string;
  last_message: string;
  message_count: number;
  last_active: string;
}

interface SessionListProps {
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
}

export function SessionList({ currentSessionId, onSelectSession }: SessionListProps) {
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    fetch("/api/memory?type=sessions")
      .then((res) => res.json())
      .then((data) => setSessions(data))
      .catch(console.error);
  }, []);

  if (sessions.length === 0) {
    return <div className="p-4 text-center text-sm text-text-3">Aucune conversation</div>;
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      {sessions.map((session) => (
        <button
          key={session.session_id}
          onClick={() => onSelectSession(session.session_id)}
          className={cn(
            "flex flex-col items-start p-3 rounded-lg text-left transition-colors border border-transparent",
            currentSessionId === session.session_id
              ? "bg-bg-3 border-border"
              : "hover:bg-bg-3"
          )}
        >
          <div className="flex items-center justify-between w-full mb-1">
            <span className="text-sm font-medium text-text truncate pr-2">
              {session.last_message ? session.last_message.slice(0, 40) + "..." : "Nouvelle discussion"}
            </span>
            <span className="text-xs text-text-3 whitespace-nowrap">
              {formatDistanceToNow(new Date(session.last_active), { addSuffix: true, locale: fr })}
            </span>
          </div>
          <div className="flex items-center text-xs text-text-2 gap-1.5">
            <MessageSquare size={12} />
            {session.message_count} message{session.message_count > 1 ? "s" : ""}
          </div>
        </button>
      ))}
    </div>
  );
}
