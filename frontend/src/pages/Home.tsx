import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Brain, LogOut, Settings as SettingsIcon, Send, Moon, Sun, Wrench, X, Zap, Mic, Copy, Check, Menu, Plus } from 'lucide-react';
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


const CodeBlock = ({ node, inline, className, children, ...props }: any) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');

  const handleCopy = () => {
    navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!inline && match) {
    return (
      <div className="relative group rounded-md overflow-hidden bg-zinc-950 my-4">
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 text-zinc-400 text-xs font-mono border-b border-zinc-800">
          <span>{match[1]}</span>
          <button
            onClick={handleCopy}
            className="hover:text-white transition-colors focus:outline-none flex items-center gap-1"
            title="Copier le code"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copié' : 'Copier'}</span>
          </button>
        </div>
        <div className="p-4 overflow-x-auto text-sm text-zinc-100 font-mono">
          <code className={className} {...props}>
            {children}
          </code>
        </div>
      </div>
    );
  }
  return (
    <code className="bg-muted text-foreground px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
      {children}
    </code>
  );
};


const MarkdownRenderer = ({ content }: { content: string }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isLong = content.length > 1500;

  return (
    <div className="relative">
      <div className={`transition-all duration-300 ease-in-out ${!isExpanded && isLong ? 'max-h-[500px] overflow-hidden mask-image-bottom' : ''}`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({node, ...props}) => <p className="whitespace-pre-wrap" {...props} />,
            li: ({node, ...props}) => <li className="whitespace-pre-wrap" {...props} />,
            code: CodeBlock as any,
            table: ({node, ...props}) => <div className="overflow-x-auto my-4 border border-border rounded-lg"><table className="min-w-full divide-y divide-border" {...props} /></div>,
            thead: ({node, ...props}) => <thead className="bg-muted" {...props} />,
            th: ({node, ...props}) => <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider" {...props} />,
            td: ({node, ...props}) => <td className="px-4 py-2 text-sm whitespace-nowrap border-t border-border" {...props} />,
            ul: ({node, ...props}) => <ul className="list-disc pl-6 my-4 space-y-1" {...props} />,
            ol: ({node, ...props}) => <ol className="list-decimal pl-6 my-4 space-y-1" {...props} />,
            hr: ({node, ...props}) => <hr className="my-6 border-t-2 border-border/50" {...props} />,
            a: ({node, ...props}) => <a className="text-primary hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
            h1: ({node, ...props}) => <h1 className="text-2xl font-bold mt-6 mb-4" {...props} />,
            h2: ({node, ...props}) => <h2 className="text-xl font-bold mt-5 mb-3" {...props} />,
            h3: ({node, ...props}) => <h3 className="text-lg font-semibold mt-4 mb-2" {...props} />
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
      {!isExpanded && isLong && (
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-card to-transparent flex items-end justify-center pb-2">
          <button
            onClick={() => setIsExpanded(true)}
            className="text-sm bg-secondary text-secondary-foreground px-4 py-1.5 rounded-full shadow-sm hover:bg-secondary/80 font-medium z-10"
          >
            Voir plus
          </button>
        </div>
      )}
      {isExpanded && isLong && (
        <button
          onClick={() => setIsExpanded(false)}
          className="mt-4 text-sm text-primary hover:underline font-medium"
        >
          Voir moins
        </button>
      )}
    </div>
  );
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isRequestInFlight, setIsRequestInFlight] = useState(false);
  const [queuedMessages, setQueuedMessages] = useState<string[]>([]);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Message[]>([]);
  const recognitionRef = useRef<any>(null);
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

    // Load local messages first for instant feedback
    const savedMessages = localStorage.getItem(storageKey);
    if (savedMessages) {
      try {
        const parsed = JSON.parse(savedMessages) as Message[];
        if (Array.isArray(parsed)) {
          setMessages(parsed);
        }
      } catch (error) {
        console.error('Could not parse local messages:', error);
      }
    }

    // Then fetch from server
    api.get('/chat/history')
      .then((data) => {
        if (data && data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
          // Normalize format if needed
          const formatted = data.messages.map((m: any) => ({
            role: m.role,
            content: m.content || '',
            tools: m.tools
          }));
          setMessages(formatted);
          localStorage.setItem(storageKey, JSON.stringify(formatted));
        }
      })
      .catch((err) => {
        console.error('Failed to load chat history from server:', err);
      });
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


  const handleMicrophoneClick = () => {
    // Check for browser support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Désolé, votre navigateur ne supporte pas la reconnaissance vocale.");
      return;
    }

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.error("Failed to stop recognition:", e);
        }
      }
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR'; // Force French for optimal phonetic matching
    recognition.interimResults = false; // Désactivé car on ne gère que les résultats finaux pour éviter l'accumulation d'interim avec prev
    recognition.continuous = true; // continuous dictation so it does not cut off during pauses
    recognition.maxAlternatives = 1;

    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsListening(true);
    };

    // FIX BUG Répétition Speech-to-Text:
    // 1. On garde l'index du dernier résultat traité (lastProcessedIndex) pour ne lire QUE les nouveaux résultats (évite de relire tout l'historique event.results depuis le début).
    // 2. On utilise le callback setInput(prev => ...) pour se baser sur la valeur *actuelle* du champ de saisie, au lieu de capturer une closure figée de "input" au moment du clic.
    let lastProcessedIndex = -1;
    let lastProcessedTranscript = '';

    recognition.onresult = (event: any) => {
      let finalTranscript = '';

      for (let i = lastProcessedIndex + 1; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const transcript = event.results[i][0].transcript;

          // Dédoublonnage : éviter de répéter le même résultat consécutif (bug du Speech API)
          if (transcript.trim().toLowerCase() !== lastProcessedTranscript.trim().toLowerCase()) {
            finalTranscript += transcript;
            lastProcessedTranscript = transcript;
          }
          lastProcessedIndex = i; // On met à jour l'index pour ne pas re-traiter ce résultat au prochain onresult
        }
      }

      if (finalTranscript) {
        setInput(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      setIsListening(false);
      if (event.error === 'not-allowed') {
        alert("Permission refusée pour le microphone. Veuillez autoriser l'accès dans les paramètres de votre navigateur.");
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch (err) {
      console.error(err);
      setIsListening(false);
      recognitionRef.current = null;
    }
  };

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
      {/* Mobile Drawer Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          
          {/* Drawer content */}
          <div className="relative flex w-64 max-w-xs flex-1 flex-col bg-card border-r border-border p-4 animate-in slide-in-from-left duration-200">
            {/* Close button */}
            <div className="flex items-center justify-between pb-4 border-b border-border mb-4">
              <div className="flex items-center space-x-2">
                <img src="/logo.png" alt="NudgeBot" className="w-8 h-8" />
                <span className="font-bold text-lg text-foreground">NudgeBot</span>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => setIsMobileMenuOpen(false)} aria-label="Close menu">
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="text-sm text-muted-foreground mb-4">Chat History</div>
              <div
                className="p-2 hover:bg-muted rounded-md cursor-pointer text-sm truncate transition-colors"
                onClick={() => {
                  handleNewConversation();
                  setIsMobileMenuOpen(false);
                }}
              >
                New Conversation
              </div>
            </div>

            <div className="mt-auto border-t border-border pt-4 space-y-2">
              <Button variant="ghost" className="w-full justify-start" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                {theme === 'dark' ? <Sun className="w-4 h-4 mr-2" /> : <Moon className="w-4 h-4 mr-2" />}
                Toggle Theme
              </Button>
              <Button variant="ghost" className="w-full justify-start" onClick={() => {
                navigate('/settings');
                setIsMobileMenuOpen(false);
              }}>
                <SettingsIcon className="w-4 h-4 mr-2" />
                Settings
              </Button>
              <Button variant="ghost" className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar for Desktop */}
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
        {/* Mobile Top Bar */}
        <div className="md:hidden border-b border-border bg-card px-3 py-2 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon-sm" onClick={() => setIsMobileMenuOpen(true)} aria-label="Open menu">
                <Menu className="w-5 h-5 text-foreground" />
              </Button>
              <img src="/logo.png" alt="NudgeBot" className="w-7 h-7" />
              <span className="font-semibold text-foreground">NudgeBot</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="icon-sm" onClick={handleNewConversation} aria-label="New conversation" title="Nouvelle discussion">
                <Plus className="w-4 h-4 text-foreground" />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme" title="Changer le thème">
                {theme === 'dark' ? <Sun className="w-4 h-4 text-foreground" /> : <Moon className="w-4 h-4 text-foreground" />}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4">
              <Brain className="w-16 h-16 opacity-20" />
              <p className="text-lg">How can I help you today?</p>

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
                    ? 'bg-primary text-primary-foreground rounded-br-none whitespace-pre-wrap'
                    : 'bg-card border border-border text-foreground rounded-bl-none'
                    }`}>
                    {msg.role === 'assistant' ? (
                      <div className="prose dark:prose-invert max-w-none text-sm break-words prose-p:text-foreground/90 prose-headings:text-foreground prose-strong:text-foreground prose-li:text-foreground/90 prose-td:text-foreground/90">
                        <MarkdownRenderer content={msg.content} />
                      </div>
                    ) : (
                      <div className="text-sm break-words whitespace-pre-wrap">
                        {msg.content}
                      </div>
                    )}
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
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message NudgeBot..."
              className="border-0 focus-visible:ring-0 resize-none min-h-[56px] max-h-48 py-4 px-4 bg-transparent shadow-none"
              rows={1}
            />
            <div className="p-2 h-full flex items-end">

              <Button
                size="icon"
                className={`rounded-lg h-10 w-10 shrink-0 mr-2 ${isListening ? 'bg-red-500 hover:bg-red-600 animate-pulse' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}
                onClick={handleMicrophoneClick}
                title="Dictée vocale"
              >
                <Mic className="w-4 h-4" />
              </Button>
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
