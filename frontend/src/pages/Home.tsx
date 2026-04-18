import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Brain, LogOut, Settings as SettingsIcon, Send, Moon, Sun, Wrench, X, Zap } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '@/lib/api';

type ToolCall = {
  name: string;
  input?: unknown;
  result?: unknown;
};

type Message = {
  role: 'user' | 'assistant';
  content: string;
  tools?: ToolCall[];
};

type StreamEvent =
  | { type: 'thinking' }
  | { type: 'delta'; content: string }
  | { type: 'tool_start'; tool_name: string; input: unknown }
  | { type: 'tool_result'; tool_name: string; result: unknown }
  | { type: 'error'; error: string }
  | { type: 'done' };

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isRequestInFlight, setIsRequestInFlight] = useState(false);
  const [queuedMessages, setQueuedMessages] = useState<string[]>([]);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Message[]>([]);
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const storageKey = `chat_messages_${user.id ?? 'anonymous'}`;

  useEffect(() => {
    if (!user.id) {
      navigate('/login');
    }
  }, [user.id, navigate]);

  useEffect(() => {
    if (!user.id) return;
    const savedMessages = localStorage.getItem(storageKey);
    if (!savedMessages) return;

    try {
      const parsed = JSON.parse(savedMessages) as Message[];
      if (Array.isArray(parsed)) {
        setMessages(parsed);
      }
    } catch (error) {
      console.error('Could not restore saved conversation:', error);
    }
  }, [storageKey, user.id]);

  useEffect(() => {
    if (!user.id) return;
    localStorage.setItem(storageKey, JSON.stringify(messages));
  }, [messages, storageKey, user.id]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('auth_token');
    navigate('/login');
  };

  const handleNewConversation = () => {
    setMessages([]);
    localStorage.removeItem(storageKey);
  };

  const processMessage = async (messageText: string) => {
    const trimmedMessage = messageText.trim();
    if (!trimmedMessage) return;

    const currentMessages = messagesRef.current;
    const newMessages = [...currentMessages, { role: 'user', content: trimmedMessage } as Message];
    setMessages(newMessages);
    setIsThinking(true);
    setIsRequestInFlight(true);
    setActiveToolName(null);

    try {
      const response = await api.postStream('/chat', {
        user_id: user.id,
        messages: newMessages.map(m => ({ role: m.role, content: m.content }))
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Request failed with status ${response.status}`);
      }

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const assistantMessage: Message = { role: 'assistant', content: '', tools: [] };
      const updatedMessages = [...newMessages, assistantMessage];
      setMessages(updatedMessages);

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.indexOf('\n\n');
        while (boundary !== -1) {
          const chunk = buffer.substring(0, boundary);
          buffer = buffer.substring(boundary + 2);

          if (chunk.startsWith('data: ')) {
            const dataStr = chunk.replace('data: ', '').trim();
            if (dataStr) {
              try {
                const data = JSON.parse(dataStr) as StreamEvent;

                if (data.type === 'thinking') {
                  setIsThinking(true);
                } else if (data.type === 'delta') {
                  assistantMessage.content += data.content;
                  setMessages([...newMessages, { ...assistantMessage }]);
                } else if (data.type === 'tool_start') {
                  setIsThinking(false);
                  setActiveToolName(data.tool_name);
                  assistantMessage.tools = assistantMessage.tools || [];
                  assistantMessage.tools.push({ name: data.tool_name, input: data.input });
                  setMessages([...newMessages, { ...assistantMessage }]);
                } else if (data.type === 'tool_result') {
                  assistantMessage.tools = assistantMessage.tools || [];
                  const toolIndex = assistantMessage.tools.findIndex(t => t.name === data.tool_name && !t.result);
                  if (toolIndex !== -1) {
                    assistantMessage.tools[toolIndex].result = data.result;
                  }
                  setActiveToolName(null);
                  setMessages([...newMessages, { ...assistantMessage }]);
                } else if (data.type === 'error') {
                  console.error("Chat Error:", data.error);
                  assistantMessage.content += `\n\n**Error:** ${data.error}`;
                  setMessages([...newMessages, { ...assistantMessage }]);
                  setIsThinking(false);
                  setActiveToolName(null);
                } else if (data.type === 'done') {
                  setIsThinking(false);
                  setActiveToolName(null);
                }
              } catch (e) {
                console.error("Error parsing SSE data:", e, "Chunk:", chunk);
              }
            }
          }
          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch (error) {
      console.error("Fetch error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage !== 'Unauthorized') {
        const errorMsg: Message = {
          role: 'assistant',
          content: `**Error:** Could not connect to the server or process the request. (${errorMessage})`
        };
        setMessages([...newMessages, errorMsg]);
      }
    } finally {
      setIsThinking(false);
      setActiveToolName(null);
      setIsRequestInFlight(false);
    }
  };

  useEffect(() => {
    if (isRequestInFlight || queuedMessages.length === 0) return;
    const [nextMessage, ...remaining] = queuedMessages;
    setQueuedMessages(remaining);
    void processMessage(nextMessage);
  }, [queuedMessages, isRequestInFlight]);

  const enqueueMessage = () => {
    const trimmedInput = input.trim();
    if (!trimmedInput) return;
    setQueuedMessages(prev => [...prev, trimmedInput]);
    setInput('');
  };

  const cancelQueuedMessage = (index: number) => {
    setQueuedMessages(prev => prev.filter((_, i) => i !== index));
  };

  const forceQueuedMessage = (index: number) => {
    setQueuedMessages(prev => {
      if (index <= 0 || index >= prev.length) return prev;
      const forced = prev[index];
      const rest = prev.filter((_, i) => i !== index);
      return [forced, ...rest];
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      enqueueMessage();
    }
  };

  return (
    <div className="flex h-screen bg-background">
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

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4">
              <Brain className="w-16 h-16 opacity-20" />
              <p className="text-lg">How can I help you today?</p>
              <div className="w-full max-w-2xl bg-card border border-border rounded-xl p-4 text-left">
                <div className="flex items-center gap-2 text-foreground font-medium mb-3">
                  <Wrench className="w-4 h-4 text-primary" />
                  <span>Tools</span>
                </div>
                <ul className="space-y-2 text-sm">
                  <li>
                    <span className="font-mono text-primary">schedule_task</span>
                    <span className="ml-2">Plan a one-off or recurring task/reminder.</span>
                  </li>
                  <li>
                    <span className="font-mono text-primary">list_tasks</span>
                    <span className="ml-2">Show all active scheduled tasks.</span>
                  </li>
                  <li>
                    <span className="font-mono text-primary">cancel_task</span>
                    <span className="ml-2">Cancel a task by its ID.</span>
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>

                {msg.role === 'assistant' && msg.tools && msg.tools.length > 0 && (
                  <div className="flex flex-col space-y-2 mb-2 w-full max-w-3xl">
                    {msg.tools.map((tool, tIdx) => (
                      <div key={tIdx} className="bg-muted/50 border border-border p-3 rounded-xl text-sm text-muted-foreground max-w-fit">
                        <div className="flex items-center space-x-2 font-mono text-xs text-primary mb-1">
                          <Wrench className="w-3 h-3" />
                          <span>{tool.name}</span>
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

                {msg.content && (
                  <div className={`max-w-[90%] md:max-w-3xl p-4 rounded-xl shadow-sm ${msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-none'
                    : 'bg-card border border-border text-foreground rounded-bl-none'
                    }`}>
                    <div className={`prose dark:prose-invert max-w-none text-sm break-words ${msg.role === 'user' ? 'prose-p:text-primary-foreground prose-headings:text-primary-foreground prose-strong:text-primary-foreground' : ''}`}>
                      {msg.role === 'assistant' ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      ) : (
                        msg.content
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}

          {isThinking && (
            <div className="flex justify-start">
              <div className="bg-card border border-border p-4 rounded-xl rounded-bl-none flex items-center space-x-3 text-muted-foreground text-sm shadow-sm">
                <Brain className="w-4 h-4 animate-pulse text-primary" />
                <span className="animate-pulse">NudgeBot is thinking...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} className="h-4" />
        </div>

        <div className="p-4 bg-background border-t border-border">
          {(isThinking || activeToolName || isRequestInFlight || queuedMessages.length > 0) && (
            <div className="max-w-3xl mx-auto mb-3">
              {isThinking && (
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
                  <Brain className="w-3.5 h-3.5 animate-pulse text-primary" />
                  <span>NudgeBot réfléchit…</span>
                </div>
              )}
              {activeToolName && (
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground ml-2">
                  <Wrench className="w-3.5 h-3.5 text-primary" />
                  <span>Utilisation de l’outil: <span className="font-mono">{activeToolName}</span></span>
                </div>
              )}
              {queuedMessages.length > 0 && (
                <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground ml-2">
                  <Send className="w-3.5 h-3.5 text-primary" />
                  <span>{queuedMessages.length} message{queuedMessages.length > 1 ? 's' : ''} en file d’attente</span>
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
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message NudgeBot..."
              className="border-0 focus-visible:ring-0 resize-none min-h-[56px] max-h-48 py-4 px-4 bg-transparent shadow-none"
              rows={1}
            />
            <div className="p-2 h-full flex items-end">
              <Button
                size="icon"
                className="rounded-lg h-10 w-10 shrink-0"
                disabled={!input.trim()}
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
