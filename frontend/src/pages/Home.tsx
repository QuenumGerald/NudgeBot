import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, User, Wrench, Loader2 } from 'lucide-react';

interface ToolCall {
  name: string;
  input?: any;
  result?: any;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { id: Date.now().toString(), role: 'user', content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!response.ok) throw new Error('Chat request failed');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No reader available');

      let currentAssistantMessage: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: '', tool_calls: [] };
      setMessages(prev => [...prev, currentAssistantMessage]);

      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || ''; // Keep the incomplete part

        for (const line of lines) {
          if (!line.startsWith('event: ')) continue;

          const eventMatch = line.match(/event: (.*?)\ndata: (.*)/);
          if (eventMatch) {
            const eventType = eventMatch[1];
            const data = JSON.parse(eventMatch[2]);

            if (eventType === 'thinking') {
              // Handle thinking state if needed visually
            } else if (eventType === 'delta') {
              currentAssistantMessage.content += data.content;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { ...currentAssistantMessage };
                return updated;
              });
            } else if (eventType === 'tool_start') {
              const toolCall = { name: data.name, input: data.input };
              currentAssistantMessage.tool_calls = [...(currentAssistantMessage.tool_calls || []), toolCall];
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { ...currentAssistantMessage };
                return updated;
              });
            } else if (eventType === 'tool_result') {
                if (currentAssistantMessage.tool_calls && currentAssistantMessage.tool_calls.length > 0) {
                    const lastTool = currentAssistantMessage.tool_calls[currentAssistantMessage.tool_calls.length - 1];
                    lastTool.result = data.result;
                    setMessages(prev => {
                        const updated = [...prev];
                        updated[updated.length - 1] = { ...currentAssistantMessage };
                        return updated;
                    });
                }
            } else if (eventType === 'error') {
               console.error('Chat error event:', data.error);
               setError(data.error);
            }
          }
        }
      }
    } catch (error: any) {
      console.error('Error in chat:', error);
      setError(error.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="h-14 border-b flex items-center px-6 shrink-0 bg-background/95 backdrop-blur z-10">
        <h2 className="font-semibold">Chat Assistant</h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4">
            <Bot className="w-12 h-12" />
            <p className="text-lg">How can I help you today?</p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div key={index} className={`flex gap-4 max-w-4xl mx-auto ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="w-5 h-5 text-primary" />
                </div>
              )}

              <div className={`space-y-2 max-w-[80%] ${msg.role === 'user' ? 'bg-primary text-primary-foreground px-4 py-2 rounded-2xl rounded-tr-sm' : 'bg-muted/50 px-4 py-3 rounded-2xl rounded-tl-sm'}`}>
                {msg.content ? (
                  <div className={`prose prose-sm dark:prose-invert max-w-none break-words ${msg.role === 'user' ? 'text-primary-foreground' : ''}`}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                ) : msg.role === 'assistant' && (!msg.tool_calls || msg.tool_calls.length === 0) && index === messages.length - 1 && isLoading ? (
                  <div className="flex space-x-1.5 h-6 items-center px-1">
                    <div className="w-2 h-2 rounded-full bg-primary/40 animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-2 h-2 rounded-full bg-primary/40 animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-2 h-2 rounded-full bg-primary/40 animate-bounce"></div>
                  </div>
                ) : null}

                {msg.tool_calls?.map((tool, tIndex) => (
                  <div key={tIndex} className="bg-background/80 border rounded-md p-3 text-sm font-mono space-y-2 mt-2">
                    <div className="flex items-center gap-2 text-muted-foreground font-semibold">
                      <Wrench className="w-4 h-4" />
                      <span>{tool.name}</span>
                      {!tool.result && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
                    </div>
                    {tool.input && (
                      <div className="text-xs opacity-70 truncate">Input: {JSON.stringify(tool.input)}</div>
                    )}
                    {tool.result && (
                      <div className="text-xs text-primary bg-primary/10 p-1.5 rounded truncate">Result: {JSON.stringify(tool.result)}</div>
                    )}
                  </div>
                ))}
              </div>

              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  <User className="w-5 h-5" />
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* Error Message */}
      {error && (
        <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm text-center border-t border-destructive/20">
          {error}
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 bg-background border-t shrink-0">
        <div className="max-w-4xl mx-auto relative flex items-end gap-2 bg-muted/50 p-2 rounded-xl border focus-within:ring-1 focus-within:ring-ring focus-within:border-ring">
          <Textarea
            value={input}
            onChange={(e: any) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            className="min-h-[44px] max-h-48 resize-none border-0 bg-transparent focus-visible:ring-0 px-2 py-3"
            rows={1}
          />
          <Button
            size="icon"
            className="mb-1 shrink-0 rounded-lg"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
          </Button>
        </div>
        <div className="text-center mt-2 text-xs text-muted-foreground">
          NudgeBot can make mistakes. Consider verifying important information.
        </div>
      </div>
    </div>
  );
}
