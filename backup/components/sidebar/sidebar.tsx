"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { SessionList } from "./session-list";
import { StatsGrid } from "./stats-grid";
import { Button } from "@/components/ui/button";
import { Plus, LogOut } from "lucide-react";

interface SidebarProps {
  currentSessionId: string | null;
  onSelectSession: (id: string | null) => void;
  onLogout: () => void;
}

export function Sidebar({ currentSessionId, onSelectSession, onLogout }: SidebarProps) {
  return (
    <div className="flex flex-col h-full bg-bg-2 border-r border-border">
      <div className="p-4 flex items-center gap-3 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-accent-2 flex items-center justify-center shadow-lg shadow-accent/20">
          <span className="text-white font-bold text-lg font-sans">N</span>
        </div>
        <h1 className="font-bold text-lg font-sans text-text">Nudgebot</h1>
      </div>

      <div className="p-4 pb-0">
        <Button
          onClick={() => onSelectSession(null)}
          variant="outline"
          className="w-full justify-start gap-2 border-accent/30 hover:border-accent hover:bg-accent/10 text-accent transition-all"
        >
          <Plus size={16} />
          Nouvelle discussion
        </Button>
      </div>

      <ScrollArea className="flex-1 mt-4">
        <SessionList currentSessionId={currentSessionId} onSelectSession={onSelectSession} />
      </ScrollArea>

      <StatsGrid />

      <div className="p-4 border-t border-border">
        <Button
          onClick={onLogout}
          variant="ghost"
          className="w-full justify-start gap-2 text-text-3 hover:text-red hover:bg-red/10"
        >
          <LogOut size={16} />
          Déconnexion
        </Button>
      </div>
    </div>
  );
}
