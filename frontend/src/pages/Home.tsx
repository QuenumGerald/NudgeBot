import { FormEvent, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Message, streamChat } from "@/lib/api";

interface ToolEvent {
  id: string;
  text: string;
}

export const HomePage = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [toolEvents, setToolEvents] = useState<ToolEvent[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolEvents]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);

    let assistantBuffer = "";
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      await streamChat(nextMessages, (type, payload) => {
        if (type === "delta") {
          assistantBuffer += String(payload.text ?? "");
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: "assistant", content: assistantBuffer };
            return copy;
          });
        }
        if (type === "tool_start") {
          setToolEvents((prev) => [...prev, { id: crypto.randomUUID(), text: `🔧 ${String(payload.name)}: ${JSON.stringify(payload.input)}` }]);
        }
        if (type === "tool_result") {
          setToolEvents((prev) => [...prev, { id: crypto.randomUUID(), text: `✅ ${String(payload.name)}: ${JSON.stringify(payload.result)}` }]);
        }
      });
    } catch (error) {
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, chat failed. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="mx-auto flex h-[calc(100vh-8rem)] max-w-4xl flex-col rounded-lg border bg-white dark:bg-slate-900">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={message.role === "user" ? "text-right" : "text-left"}>
            <div className="inline-block max-w-[85%] rounded-lg bg-slate-100 px-4 py-3 text-left dark:bg-slate-800">
              <div className="prose prose-slate max-w-none dark:prose-invert">
                <Markdown remarkPlugins={[remarkGfm]}>{message.content || (isLoading && index === messages.length - 1 ? "…" : "")}</Markdown>
              </div>
            </div>
          </div>
        ))}
        {isLoading ? <div className="animate-pulse text-sm text-slate-500">Thinking…</div> : null}
        {toolEvents.map((item) => <div key={item.id} className="text-sm text-slate-500">{item.text}</div>)}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="border-t p-4">
        <Textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask NudgeBot anything..." />
        <div className="mt-3 flex justify-end">
          <Button type="submit" disabled={isLoading}>Send</Button>
        </div>
      </form>
    </section>
  );
};
