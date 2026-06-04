import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { ChatLayout } from '@/components/chat/ChatLayout';
import { Message } from '@/components/chat/MessageBubble';

type StreamEvent =
  | { type: 'thinking' }
  | { type: 'delta'; content: string }
  | { type: 'tool_start'; tool_name: string; input: unknown }
  | { type: 'tool_result'; tool_name: string; result: unknown }
  | { type: 'error'; error: string }
  | { type: 'done' };

interface SpeechRecognitionEvent {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
      isFinal: boolean;
    };
    length: number;
  };
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
}

interface ApiChatHistoryResponse {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    tools?: unknown[];
  }>;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isRequestInFlight, setIsRequestInFlight] = useState(false);
  const [queuedMessages, setQueuedMessages] = useState<string[]>([]);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Message[]>([]);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const navigate = useNavigate();

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
      .then((data: unknown) => {
        const typedData = data as ApiChatHistoryResponse;
        if (typedData && typedData.messages && Array.isArray(typedData.messages) && typedData.messages.length > 0) {
          // Normalize format if needed
          const formatted = typedData.messages.map((m) => ({
            role: m.role,
            content: m.content || '',
            tools: m.tools
          }));
          setMessages(formatted);
        } else if (typedData && typedData.messages && Array.isArray(typedData.messages) && typedData.messages.length === 0) {
           // If remote is completely empty but local has something, push local to remote
           const currentLocal = localStorage.getItem(storageKey);
           if (currentLocal && JSON.parse(currentLocal).length > 0) {
             const localMsgs = JSON.parse(currentLocal);
             if (localMsgs.length > 0) {
               console.log("Remote is empty, syncing local to remote in background...");
               api.postStream('/chat', { user_id: user.id, messages: localMsgs })
                 .catch((e: unknown) => console.error("Sync error:", e));
             }
           }
        }
      })
      .catch((error: unknown) => console.error('Failed to load chat history:', error));
  }, [user.id, storageKey]);

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
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert("Votre navigateur ne supporte pas la reconnaissance vocale.");
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = 'fr-FR';
    recognition.interimResults = true;
    recognition.continuous = true;

    recognitionRef.current = recognition;

    let finalTranscriptTracker = "";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript && finalTranscript !== finalTranscriptTracker) {
        finalTranscriptTracker = finalTranscript;
        setInput(prev => prev + " " + finalTranscript);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
    setIsListening(true);
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

  const processMessage = useCallback(async (messageText: string) => {
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
  }, [user.id]);

  useEffect(() => {
    if (isRequestInFlight || queuedMessages.length === 0) return;
    const [nextMessage, ...remaining] = queuedMessages;
    setQueuedMessages(remaining);
    void processMessage(nextMessage);
  }, [queuedMessages, isRequestInFlight, processMessage]);

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
    <ChatLayout
      messages={messages}
      isThinking={isThinking}
      activeToolName={activeToolName}
      isRequestInFlight={isRequestInFlight}
      queuedMessages={queuedMessages}
      messagesEndRef={messagesEndRef}
      handleNewConversation={handleNewConversation}
      handleLogout={handleLogout}
      input={input}
      setInput={setInput}
      handleKeyDown={handleKeyDown}
      handleMicrophoneClick={handleMicrophoneClick}
      enqueueMessage={enqueueMessage}
      isListening={isListening}
      cancelQueuedMessage={cancelQueuedMessage}
      forceQueuedMessage={forceQueuedMessage}
    />
  );
}
