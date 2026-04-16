import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Brain, LogOut, Settings as SettingsIcon, Send, Moon, Sun, Wrench } from 'lucide-react';
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    if (!user.id) {
      navigate('/login');
    }
  }, [user.id, navigate]);

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

  const sendMessage = async () => {
    if (!input.trim()) return;

    const newMessages = [...messages, { role: 'user', content: input } as Message];
    setMessages(newMessages);
    setInput('');
    setIsThinking(true);

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
                  setIsThinking(false);
                } else if (data.type === 'delta') {
                  assistantMessage.content += data.content;
                  setMessages([...newMessages, { ...assistantMessage }]);
                } else if (data.type === 'tool_start') {
                  assistantMessage.tools = assistantMessage.tools || [];
                  assistantMessage.tools.push({ name: data.tool_name, input: data.input });
                  setMessages([...newMessages, { ...assistantMessage }]);
                } else if (data.type === 'tool_result') {
                  assistantMessage.tools = assistantMessage.tools || [];
                  const toolIndex = assistantMessage.tools.findIndex(t => t.name === data.tool_name && !t.result);
                  if (toolIndex !== -1) {
                    assistantMessage.tools[toolIndex].result = data.result;
                  }
                  setMessages([...newMessages, { ...assistantMessage }]);
                } else if (data.type === 'error') {
                  console.error("Chat Error:", data.error);
                  assistantMessage.content += `\n\n**Error:** ${data.error}`;
                  setMessages([...newMessages, { ...assistantMessage }]);
                  setIsThinking(false);
                } else if (data.type === 'done') {
                  setIsThinking(false);
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
      setIsThinking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
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
          <div className="p-2 hover:bg-muted rounded-md cursor-pointer text-sm truncate transition-colors">
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
                disabled={!input.trim() || isThinking}
                onClick={sendMessage}
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
