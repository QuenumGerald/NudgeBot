import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Brain, LogOut, Settings as SettingsIcon, Send, Moon, Sun, Wrench, X, Zap } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function Home() {
  const [inputValue, setInputValue] = useState('');
  const [queuedMessages, setQueuedMessages] = useState<string[]>([]);
  const isProcessingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const storageKey = `chat_messages_${user.id ?? 'anonymous'}`;

  // Load initial messages from localStorage (handles both old and new formats)
  const [initialMessages] = useState<UIMessage[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.map((m: any): UIMessage => {
        if ('id' in m && 'parts' in m) return m as UIMessage;
        return {
          id: crypto.randomUUID(),
          role: m.role,
          content: m.content ?? '',
          parts: [{ type: 'text' as const, text: m.content ?? '' }],
        };
      });
    } catch {
      return [];
    }
  });

  const { messages, sendMessage, status, setMessages } = useChat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      headers: () => ({
        Authorization: `Bearer ${localStorage.getItem('auth_token') ?? ''}`,
      }),
    }),
  });

  const isStreaming = status === 'streaming' || status === 'awaiting-message';

  // Active tool name: last tool-call part without a matching tool-result
  const activeToolName = (() => {
    if (!isStreaming) return null;
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant') return null;
    const parts = lastMsg.parts as any[];
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (p.type === 'tool-call') {
        const hasResult = parts.slice(i + 1).some(
          (r: any) => r.type === 'tool-result' && r.toolCallId === p.toolCallId
        );
        if (!hasResult) return p.toolName as string;
      }
    }
    return null;
  })();

  useEffect(() => {
    if (!user.id) navigate('/login');
  }, [user.id, navigate]);

  // Persist messages to localStorage
  useEffect(() => {
    if (!user.id) return;
    localStorage.setItem(storageKey, JSON.stringify(messages));
  }, [messages, storageKey, user.id]);

  // Auto-scroll on new content
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // Process message queue when not streaming
  useEffect(() => {
    if (isStreaming || queuedMessages.length === 0 || isProcessingRef.current) return;
    isProcessingRef.current = true;
    const [next, ...rest] = queuedMessages;
    setQueuedMessages(rest);
    sendMessage({ text: next }).finally(() => {
      isProcessingRef.current = false;
    });
  }, [isStreaming, queuedMessages, sendMessage]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('auth_token');
    navigate('/login');
  };

  const handleNewConversation = () => {
    setMessages([]);
    localStorage.removeItem(storageKey);
  };

  const enqueueMessage = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setQueuedMessages(prev => [...prev, trimmed]);
    setInputValue('');
  };

  const cancelQueuedMessage = (index: number) => {
    setQueuedMessages(prev => prev.filter((_, i) => i !== index));
  };

  const forceQueuedMessage = (index: number) => {
    setQueuedMessages(prev => {
      if (index <= 0 || index >= prev.length) return prev;
      const forced = prev[index];
      return [forced, ...prev.filter((_, i) => i !== index)];
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enqueueMessage();
    }
  };

  // Extract text content and tool calls from a UIMessage's parts
  const parseMessageParts = (msg: UIMessage) => {
    const parts = msg.parts as any[];
    const toolCalls: Array<{ toolCallId: string; toolName: string; input: any; result?: any }> = [];
    const toolResultMap: Record<string, any> = {};
    let textContent = '';

    for (const p of parts) {
      if (p.type === 'text') {
        textContent += p.text;
      } else if (p.type === 'tool-call') {
        toolCalls.push({ toolCallId: p.toolCallId, toolName: p.toolName, input: p.input });
      } else if (p.type === 'tool-result') {
        toolResultMap[p.toolCallId] = p.result;
      }
    }

    for (const t of toolCalls) {
      if (t.toolCallId in toolResultMap) {
        t.result = toolResultMap[t.toolCallId];
      }
    }

    return { textContent, toolCalls };
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar (desktop) */}
      <div className="w-64 border-r border-border bg-card flex flex-col hidden md:flex">
        <div className="p-4 border-b border-border flex items-center space-x-2">
          <img src="/logo.png" alt="NudgeBot" className="w-8 h-8" />
          <span className="font-bold text-lg text-foreground">NudgeBot</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="text-sm text-muted-foreground mb-4">Chat History</div>
          <div
            className="p-2 hover:bg-muted rounded-md cursor-pointer text-sm truncate transition-colors"
            onClick={handleNewConversation}
          >
            New Conversation
          </div>
        </div>

        <div className="p-4 border-t border-border space-y-2">
          <Button variant="ghost" className="w-full justify-start" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun className="w-4 h-4 mr-2" /> : <Moon className="w-4 h-4 mr-2" />}
            Toggle Theme
          </Button>
          <Button variant="ghost" className="w-full justify-start" onClick={() => navigate('/settings')}>
            <SettingsIcon className="w-4 h-4 mr-2" />
            Settings
          </Button>
          <Button variant="ghost" className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col relative max-w-full">
        {/* Mobile header */}
        <div className="md:hidden border-b border-border bg-card px-3 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="NudgeBot" className="w-7 h-7" />
              <span className="font-semibold text-foreground">NudgeBot</span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" onClick={handleNewConversation} aria-label="New conversation">
                <Wrench className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => navigate('/settings')} aria-label="Settings">
                <SettingsIcon className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleLogout} aria-label="Logout">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4">
              <Brain className="w-16 h-16 opacity-20" />
              <p className="text-lg">How can I help you today?</p>
            </div>
          ) : (
            messages.map((msg) => {
              const { textContent, toolCalls } = parseMessageParts(msg);
              return (
                <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  {msg.role === 'assistant' && toolCalls.length > 0 && (
                    <div className="flex flex-col space-y-2 mb-2 w-full max-w-3xl">
                      {toolCalls.map((tool, tIdx) => (
                        <div key={`${tool.toolCallId}-${tIdx}`} className="bg-muted/50 border border-border p-3 rounded-xl text-sm text-muted-foreground max-w-fit">
                          <div className="flex items-center space-x-2 font-mono text-xs text-primary mb-1">
                            <Wrench className="w-3 h-3" />
                            <span>{tool.toolName}</span>
                          </div>
                          <div className="font-mono text-xs opacity-80">
                            Input: {JSON.stringify(tool.input)}
                          </div>
                          {tool.result != null && (
                            <div className="font-mono text-xs mt-2 border-t border-border/50 pt-2 opacity-80">
                              Result: {JSON.stringify(tool.result).slice(0, 100)}{JSON.stringify(tool.result).length > 100 ? '...' : ''}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {textContent && (
                    <div className={`max-w-[90%] md:max-w-3xl p-4 rounded-xl shadow-sm ${msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-none'
                      : 'bg-card border border-border text-foreground rounded-bl-none'
                    }`}>
                      <div className={`prose dark:prose-invert max-w-none text-sm break-words ${msg.role === 'user' ? 'prose-p:text-primary-foreground prose-headings:text-primary-foreground prose-strong:text-primary-foreground' : ''}`}>
                        {msg.role === 'assistant' ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{textContent}</ReactMarkdown>
                        ) : (
                          textContent
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {isStreaming && !activeToolName && (
            <div className="flex justify-start">
              <div className="bg-card border border-border p-4 rounded-xl rounded-bl-none flex items-center space-x-3 text-muted-foreground text-sm shadow-sm">
                <Brain className="w-4 h-4 animate-pulse text-primary" />
                <span className="animate-pulse">NudgeBot is thinking...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} className="h-4" />
        </div>

        {/* Input area */}
        <div className="p-4 bg-background border-t border-border">
          {(isStreaming || activeToolName || queuedMessages.length > 0) && (
            <div className="max-w-3xl mx-auto mb-3">
              {isStreaming && (
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
                  <Brain className="w-3.5 h-3.5 animate-pulse text-primary" />
                  <span>NudgeBot réfléchit…</span>
                </div>
              )}
              {activeToolName && (
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground ml-2">
                  <Wrench className="w-3.5 h-3.5 text-primary" />
                  <span>Utilisation de l'outil: <span className="font-mono">{activeToolName}</span></span>
                </div>
              )}
              {queuedMessages.length > 0 && (
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground ml-2">
                  <Send className="w-3.5 h-3.5 text-primary" />
                  <span>{queuedMessages.length} message{queuedMessages.length > 1 ? 's' : ''} en file d'attente</span>
                </div>
              )}

              {queuedMessages.length > 0 && (
                <div className="mt-3 rounded-xl border border-border bg-card p-2 space-y-2">
                  {queuedMessages.map((queuedMessage, idx) => (
                    <div key={`${queuedMessage}-${idx}`} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2 py-1.5">
                      <span className="text-xs text-muted-foreground truncate">
                        #{idx + 1} — {queuedMessage}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {idx > 0 && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => forceQueuedMessage(idx)}
                            aria-label={`Forcer l'envoi du message ${idx + 1}`}
                            title="Forcer en prochain"
                          >
                            <Zap className="w-3.5 h-3.5 text-primary" />
                          </Button>
                        )}
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => cancelQueuedMessage(idx)}
                          aria-label={`Annuler le message ${idx + 1}`}
                          title="Annuler ce message"
                        >
                          <X className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="max-w-3xl mx-auto relative flex items-end shadow-sm border border-border rounded-xl bg-card focus-within:ring-1 focus-within:ring-primary transition-shadow">
            <Textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message NudgeBot..."
              className="border-0 focus-visible:ring-0 resize-none min-h-[56px] max-h-48 py-4 px-4 bg-transparent shadow-none"
              rows={1}
            />
            <div className="p-2 h-full flex items-end">
              <Button
                size="icon"
                className="rounded-lg h-10 w-10 shrink-0"
                disabled={!inputValue.trim()}
                onClick={enqueueMessage}
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
