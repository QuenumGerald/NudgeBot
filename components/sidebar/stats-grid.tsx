"use client";

import { useEffect, useState } from "react";
import { MessageSquare, Brain, Calendar } from "lucide-react";

interface Stats {
  totalMessages: number;
  totalMemories: number;
  todayMessages: number;
}

export function StatsGrid() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/memory?type=stats")
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch(console.error);
  }, []);

  if (!stats) return null;

  return (
    <div className="grid grid-cols-3 gap-2 p-4 border-t border-border bg-bg-2">
      <div className="flex flex-col items-center p-2 rounded-lg bg-bg-3 border border-border">
        <MessageSquare size={14} className="text-accent mb-1" />
        <span className="text-xs text-text-2">Total</span>
        <span className="text-sm font-mono text-text font-bold">{stats.totalMessages}</span>
      </div>
      <div className="flex flex-col items-center p-2 rounded-lg bg-bg-3 border border-border">
        <Calendar size={14} className="text-green mb-1" />
        <span className="text-xs text-text-2">Auj.</span>
        <span className="text-sm font-mono text-text font-bold">{stats.todayMessages}</span>
      </div>
      <div className="flex flex-col items-center p-2 rounded-lg bg-bg-3 border border-border">
        <Brain size={14} className="text-accent-2 mb-1" />
        <span className="text-xs text-text-2">Mémoire</span>
        <span className="text-sm font-mono text-text font-bold">{stats.totalMemories}</span>
      </div>
    </div>
  );
}
