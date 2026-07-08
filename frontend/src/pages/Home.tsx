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

interface ChatConversation {
  id: string;
  title: string;
  updated_at: string;
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
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Message[]>([]);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const navigate = useNavigate();

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const conversationsStorageKey = `chat_conversations_${user.id ?? 'anonymous'}`;
  const activeConversationStorageKey = `chat_active_conversation_${user.id ?? 'anonymous'}`;
  const storageKey = activeConversationId
    ? `chat_messages_${user.id ?? 'anonymous'}_${activeConversationId}`
    : `chat_messages_${user.id ?? 'anonymous'}_draft`;

  useEffect(() => {
    const checkSetupAndAuth = async () => {
      try {
        const res = await api.get('/setup/status') as { needsSetup: boolean };
        if (res && res.needsSetup) {
          navigate('/setup');
          return;
        }
      } catch (err) {
        console.error('Failed to check setup status:', err);
      }
      if (!user.id) {
        navigate('/login');
      }
    };
    void checkSetupAndAuth();
  }, [user.id, navigate]);

  const loadConversation = useCallback((conversationId: string) => {
    setActiveConversationId(conversationId);
    localStorage.setItem(activeConversationStorageKey, conversationId);

    const conversationStorageKey = `chat_messages_${user.id ?? 'anonymous'}_${conversationId}`;
    const savedMessages = localStorage.getItem(conversationStorageKey);
    setMessages([]);

    if (savedMessages) {
      try {
        const parsed = JSON.parse(savedMessages) as Message[];
        if (Array.isArray(parsed)) {
          setMessages(parsed);
        }
      } catch (error) {
        console.error('Could not parse local conversation messages:', error);
      }
    }

    api.get(`/chat/conversations/${conversationId}/history`)
      .then((data: unknown) => {
        const typedData = data as ApiChatHistoryResponse;
        if (typedData && Array.isArray(typedData.messages)) {
          const formatted = typedData.messages.map((m) => ({
            role: m.role,
            content: m.content || '',
            tools: m.tools
          }));
          setMessages(formatted);
        }
      })
      .catch((error: unknown) => console.error('Failed to load conversation history:', error));
  }, [activeConversationStorageKey, user.id]);

  const refreshConversations = useCallback(() => {
    if (!user.id) return;

    const savedConversations = localStorage.getItem(conversationsStorageKey);
    if (savedConversations) {
      try {
        const parsed = JSON.parse(savedConversations) as ChatConversation[];
        if (Array.isArray(parsed)) {
          setConversations(parsed);
        }
      } catch (error) {
        console.error('Could not parse local conversations:', error);
      }
    }

    api.get('/chat/conversations')
      .then((data: unknown) => {
        const typedData = data as { conversations?: ChatConversation[] };
        const remoteConversations = Array.isArray(typedData.conversations) ? typedData.conversations : [];
        setConversations(remoteConversations);
        localStorage.setItem(conversationsStorageKey, JSON.stringify(remoteConversations));

        const savedActive = localStorage.getItem(activeConversationStorageKey);
        const nextActive = savedActive && remoteConversations.some((c) => c.id === savedActive)
          ? savedActive
          : remoteConversations[0]?.id;
        if (nextActive) {
          loadConversation(nextActive);
        }
      })
      .catch((error: unknown) => console.error('Failed to load conversations:', error));
  }, [activeConversationStorageKey, conversationsStorageKey, loadConversation, user.id]);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

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

    let lastFinalTranscript = '';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      // Sur Android (Chrome Blink), un bug fait que les événements 'result'
      // peuvent émettre le même résultat final plusieurs fois
      // Au lieu de se baser sur un index, on traite uniquement le DERNIER
      // résultat final (isFinal) et on le compare au dernier transcript ajouté
      
      let currentFinalTranscript = '';

      // On cherche en partant de la fin le dernier résultat "final"
      for (let i = event.results.length - 1; i >= 0; i--) {
        if (event.results[i].isFinal) {
          currentFinalTranscript = event.results[i][0].transcript;
          break;
        }
      }

      if (currentFinalTranscript) {
        // Dédoublonnage : on vérifie que ce n'est pas le même que le précédent
        if (currentFinalTranscript.trim().toLowerCase() !== lastFinalTranscript.trim().toLowerCase()) {
          lastFinalTranscript = currentFinalTranscript;
          setInput(prev => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + currentFinalTranscript);
        }
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

  const handleNewConversation = async () => {
    setMessages([]);
    try {
      const data = await api.post('/chat/conversations', {}) as { conversation?: ChatConversation };
      if (data.conversation) {
        setConversations(prev => [data.conversation!, ...prev.filter(c => c.id !== data.conversation!.id)]);
        loadConversation(data.conversation.id);
      }
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
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
      let conversationId = activeConversationId;
      if (!conversationId) {
        const data = await api.post('/chat/conversations', {}) as { conversation?: ChatConversation };
        conversationId = data.conversation?.id || null;
        if (data.conversation) {
          setConversations(prev => [data.conversation!, ...prev.filter(c => c.id !== data.conversation!.id)]);
          setActiveConversationId(data.conversation.id);
          localStorage.setItem(activeConversationStorageKey, data.conversation.id);
        }
      }

      const response = await api.postStream('/chat', {
        user_id: user.id,
        conversation_id: conversationId,
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
      refreshConversations();
      setIsThinking(false);
      setActiveToolName(null);
      setIsRequestInFlight(false);
    }
  }, [activeConversationId, activeConversationStorageKey, refreshConversations, user.id]);

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
      conversations={conversations}
      activeConversationId={activeConversationId}
      handleNewConversation={handleNewConversation}
      handleSelectConversation={loadConversation}
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
