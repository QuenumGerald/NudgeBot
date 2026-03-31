"use client";

import { BrainCircuit, Calendar, FileText, Database } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  onSelectSuggestion: (text: string) => void;
}

export function EmptyState({ onSelectSuggestion }: EmptyStateProps) {
  const suggestions = [
    {
      icon: <Database size={20} className="text-[#2dba4e]" />,
      title: "GitHub Issues",
      description: "Résume les dernières issues ou PRs ouvertes.",
      prompt: "Peux-tu me résumer les dernières issues ouvertes sur GitHub ?",
    },
    {
      icon: <Calendar size={20} className="text-[#f87171]" />,
      title: "Agenda du jour",
      description: "Vérifie les rendez-vous et tâches.",
      prompt: "Quel est mon programme pour aujourd'hui ?",
    },
    {
      icon: <FileText size={20} className="text-[#60a5fa]" />,
      title: "Création",
      description: "Crée un fichier ou rédige un texte.",
      prompt: "Crée un fichier markdown avec les notes de la dernière réunion.",
    },
    {
      icon: <Database size={20} className="text-accent" />,
      title: "Mémoire",
      description: "Rappelle-moi un fait ou une préférence.",
      prompt: "Rappelle-toi de mes préférences pour le café.",
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto px-4 w-full animate-in fade-in zoom-in duration-500">
      <div className="relative mb-8 group">
        <div className="absolute inset-0 bg-accent blur-3xl opacity-20 group-hover:opacity-30 transition-opacity rounded-full"></div>
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-bg-3 to-bg-4 border-2 border-border flex items-center justify-center relative shadow-2xl z-10">
          <BrainCircuit size={48} className="text-accent drop-shadow-lg" />
        </div>
      </div>

      <h2 className="text-3xl font-sans font-bold text-transparent bg-clip-text bg-gradient-to-r from-text to-text-3 mb-2 text-center">
        Que puis-je faire pour toi ?
      </h2>
      <p className="text-text-2 mb-10 text-center text-sm">
        Nudgebot est prêt. Demande-lui n&apos;importe quoi.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
        {suggestions.map((item, i) => (
          <button
            key={i}
            onClick={() => onSelectSuggestion(item.prompt)}
            className="flex flex-col items-start p-5 rounded-2xl bg-bg-3 border border-border hover:border-accent/50 hover:bg-bg-4 hover:-translate-y-1 transition-all text-left shadow-sm group"
          >
            <div className="p-2 rounded-xl bg-bg-2 border border-border mb-3 group-hover:scale-110 transition-transform">
              {item.icon}
            </div>
            <h3 className="font-semibold text-text mb-1">{item.title}</h3>
            <p className="text-xs text-text-3 leading-relaxed">{item.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
