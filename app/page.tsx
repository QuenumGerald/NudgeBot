"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Brain, LogOut, MessageSquare, Settings, Moon, Sun } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useDarkMode } from "./theme-provider";

type Message = { role: string; content: string };

function normalizeWordToken(token: string): string {
  return token.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "");
}

function collapseAdjacentDuplicateWords(text: string): string {
  const parts = text.split(/(\s+)/);
  const out: string[] = [];
  let lastWord: string | null = null;

  for (const part of parts) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      out.push(part);
      continue;
    }

    const normalized = normalizeWordToken(part);
    if (normalized && normalized === lastWord) {
      continue;
    }

    out.push(part);
    if (normalized) lastWord = normalized;
  }

  return out.join("");
}

export default function Home() {
  const router = useRouter();
  const { isDark, toggleDark } = useDarkMode();
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  const handleLogout = async () => {
    await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    router.push("/login");
  };

  const handleSettings = () => {
    router.push("/settings");
  };

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status}${text ? ` - ${text.slice(0, 300)}` : ""}`);
      }

      if (!response.body) {
        const text = await response.text().catch(() => "");
        throw new Error(`No response body${text ? ` - ${text.slice(0, 300)}` : ""}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let done = false;
      let buffer = "";

      // Add empty assistant message to fill
      setMessages(prev => [...prev, { role: "assistant", content: "" }]);

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const dataStr = line.slice(6).trim();
            if (!dataStr) continue;

            try {
              const event = JSON.parse(dataStr);

              setMessages(prev => {
                const newMsgs = [...prev];
                const lastIndex = newMsgs.length - 1;
                const lastMsg = newMsgs[lastIndex];
                if (lastMsg.role !== "assistant") return prev;

                let nextContent = lastMsg.content;

                if (event.type === "delta") {
                  nextContent += event.content || "";
                  nextContent = collapseAdjacentDuplicateWords(nextContent);
                } else if (event.type === "replace") {
                  // Legacy: set full content
                  nextContent = event.content || "";
                } else if (event.type === "tool_start") {
                  // Show tool call inline
                  const inputStr = (() => {
                    try {
                      const parsed = JSON.parse(event.input || "{}");
                      return Object.values(parsed).join(" ");
                    } catch {
                      return event.input || "";
                    }
                  })();
                  nextContent += `\n\n🔧 **${event.name}**: \`${inputStr}\`\n`;
                } else if (event.type === "tool_result") {
                  nextContent += `\`\`\`\n${event.output}\n\`\`\`\n`;
                } else if (event.type === "error") {
                  nextContent += `\n\n**Error**: ${event.message}`;
                }

                newMsgs[lastIndex] = { ...lastMsg, content: nextContent };
                return newMsgs;
              });
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      const message = error instanceof Error ? error.message : "Erreur inconnue";
      setMessages(prev => [
        ...prev,
        { role: "assistant", content: `Erreur de communication avec l'assistant: ${message}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="h-16 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Brain size={20} className="text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-800 dark:text-white">Nudgebot</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 text-sm font-semibold">
            <Brain size={14} />
            Mémoire Active
          </div>
          <button
            onClick={handleSettings}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-200 transition-colors text-sm font-semibold"
          >
            <Settings size={14} />
            Paramètres
          </button>
          <button
            onClick={toggleDark}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm"
            aria-label="Toggle dark mode"
          >
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400 hover:border-red-200 dark:hover:border-red-800 transition-colors text-sm font-semibold"
          >
            <LogOut size={14} />
            Déconnexion
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 h-[600px] flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                <MessageSquare size={48} className="mb-4 text-gray-300 dark:text-gray-600" />
                <p className="text-lg font-medium">Bienvenue sur Nudgebot</p>
                <p className="text-sm mt-2">Comment puis-je vous aider aujourd&apos;hui ?</p>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      message.role === "user"
                        ? "bg-blue-500 text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100"
                    }`}
                  >
                    {message.role === "assistant" ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        className="text-sm prose dark:prose-invert prose-sm max-w-none prose-code:bg-gray-200 dark:prose-code:bg-gray-700 prose-code:px-1 prose-code:rounded prose-pre:bg-gray-800 dark:prose-pre:bg-gray-950 prose-pre:text-gray-100"
                      >
                        {message.content}
                      </ReactMarkdown>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    )}
                  </div>
                </div>
              ))
            )}
            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-2">
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                    <div className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 dark:border-gray-800 p-4">
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="Tapez votre message..."
                className="flex-1 resize-none border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500"
                rows={2}
                disabled={isLoading}
              />
              <button
                onClick={handleSubmit}
                disabled={!input.trim() || isLoading}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 dark:hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                Envoyer
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
