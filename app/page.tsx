"use client";

import { useState, useCallback, useRef, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar/sidebar";
import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { Message } from "@/components/chat/message-item";
import { Brain, LogOut } from "lucide-react";

const MODELS = {
  "deepseek/deepseek-chat-v3-0324:free": "Deepseek V3 (gratuit)",
  "deepseek/deepseek-r1:free": "Deepseek R1 - Raisonnement (gratuit)",
  "google/gemini-2.0-flash-exp:free": "Gemini 2.0 Flash (gratuit)",
  "deepseek/deepseek-chat-v3-0324": "Deepseek V3 ($0.27/M)",
  "deepseek/deepseek-r1": "Deepseek R1 ($0.55/M)",
  "google/gemini-2.5-flash-preview": "Gemini 2.5 Flash ($0.15/M)",
  "anthropic/claude-haiku-4-5": "Claude Haiku ($0.80/M)",
  "anthropic/claude-sonnet-4-5": "Claude Sonnet ($3/M)",
} as const;

export default function Home() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>(() => Math.random().toString(36).substring(2, 15));
  const [model, setModel] = useState<keyof typeof MODELS>("deepseek/deepseek-chat-v3-0324:free");

  const handleLogout = async () => {
    await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    router.push("/login");
  };

  const handleSelectSession = (id: string | null) => {
    if (id) {
      setSessionId(id);
      // Fetch history for selected session
      // For simplicity, we just clear messages and let the next message load history via backend
      // Actually, ideally we'd fetch it, but standard flow assumes state reset
      setMessages([]);
    } else {
      setSessionId(Math.random().toString(36).substring(2, 15));
      setMessages([]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleSelectSuggestion = (text: string) => {
    setInput(text);
  };

  const handleSubmit = async () => {
    console.log("[Chat] handleSubmit called, input:", input);
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    console.log("[Chat] Sending request to /api/chat");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          sessionId,
          model,
        }),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let done = false;
      let buffer = "";

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const dataStr = line.slice(6);
              if (!dataStr) continue;

              try {
                const event = JSON.parse(dataStr);
                console.log("[Chat] Received event:", event);

                setMessages((prev) => {
                  const newMsgs = [...prev];
                  const lastMsg = newMsgs[newMsgs.length - 1];

                  if (event.type === "replace") {
                    // Final answer from Cline — replace the assistant bubble entirely
                    if (lastMsg.role === "assistant" && lastMsg.type !== "tool_call") {
                      lastMsg.content = event.content;
                    } else {
                      newMsgs.push({ role: "assistant", content: event.content });
                    }
                  } else if (event.type === "delta") {
                    if (lastMsg.role === "assistant" && lastMsg.type !== "tool_call") {
                      lastMsg.content += event.content;
                    } else {
                      newMsgs.push({ role: "assistant", content: event.content });
                    }
                  } else if (event.type === "thinking") {
                    // Update the assistant bubble with current thinking status
                    if (lastMsg.role === "assistant" && lastMsg.type !== "tool_call") {
                      lastMsg.content = event.content;
                    }
                  } else if (event.type === "tool_start") {
                    newMsgs.push({
                      role: "assistant",
                      content: "",
                      type: "tool_call",
                      toolName: event.name,
                      toolInput: event.input,
                    });
                  } else if (event.type === "tool_result") {
                    const lastToolIdx = newMsgs.findLastIndex(
                      (m) => m.type === "tool_call" && m.toolName === event.name && m.toolOutput === undefined
                    );
                    if (lastToolIdx !== -1) {
                      newMsgs[lastToolIdx].toolOutput = event.output;
                    }
                  } else if (event.type === "error") {
                    newMsgs.push({ role: "assistant", content: `**Error**: ${event.message}` });
                  }

                  return newMsgs;
                });
              } catch (e) {
                // Ignore parse errors for incomplete chunks
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Une erreur est survenue lors de la communication avec l'assistant." },
      ]);
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="grid grid-cols-[260px_1fr] h-screen overflow-hidden bg-bg">
      <Sidebar
        currentSessionId={sessionId}
        onSelectSession={handleSelectSession}
        onLogout={handleLogout}
      />

      <div className="flex flex-col h-full overflow-hidden relative">
        <header className="h-14 border-b border-border flex items-center justify-between px-4 bg-bg-2 z-10 shrink-0">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green"></span>
            </span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as any)}
              className="bg-bg-3 border border-border text-sm rounded-md px-2 py-1 text-text focus:outline-none focus:ring-1 focus:ring-accent max-w-[200px] truncate"
            >
              {Object.entries(MODELS).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent/10 border border-accent/20 text-accent text-xs font-semibold">
              <Brain size={14} />
              Mémoire
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-bg-3 border border-border text-text-3 hover:text-red hover:bg-red/10 transition-colors text-xs font-semibold"
            >
              <LogOut size={14} />
              Déco
            </button>
          </div>
        </header>

        <MessageList
          messages={messages}
          isLoading={isLoading}
          onSelectSuggestion={handleSelectSuggestion}
        />

        <div className="mt-auto shrink-0 z-10">
          <ChatInput
            input={input}
            isLoading={isLoading}
            onInputChange={handleInputChange}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </div>
  );
}
