import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { ChatArea } from './ChatArea';
import { Message } from './MessageBubble';

interface ChatLayoutProps {
  messages: Message[];
  isThinking: boolean;
  activeToolName: string | null;
  isRequestInFlight: boolean;
  queuedMessages: string[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  handleNewConversation: () => void;
  handleLogout: () => void;
  // Input props
  input: string;
  setInput: (value: string) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleMicrophoneClick: () => void;
  enqueueMessage: () => void;
  isListening: boolean;
  cancelQueuedMessage: (index: number) => void;
  forceQueuedMessage: (index: number) => void;
}

export function ChatLayout({
  messages,
  isThinking,
  activeToolName,
  isRequestInFlight,
  queuedMessages,
  messagesEndRef,
  handleNewConversation,
  handleLogout,
  input,
  setInput,
  handleKeyDown,
  handleMicrophoneClick,
  enqueueMessage,
  isListening,
  cancelQueuedMessage,
  forceQueuedMessage
}: ChatLayoutProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans">
      <Sidebar
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
        handleNewConversation={handleNewConversation}
        handleLogout={handleLogout}
      />

      <ChatArea
        messages={messages}
        isThinking={isThinking}
        activeToolName={activeToolName}
        isRequestInFlight={isRequestInFlight}
        queuedMessages={queuedMessages}
        messagesEndRef={messagesEndRef}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
        input={input}
        setInput={setInput}
        handleKeyDown={handleKeyDown}
        handleMicrophoneClick={handleMicrophoneClick}
        enqueueMessage={enqueueMessage}
        isListening={isListening}
        cancelQueuedMessage={cancelQueuedMessage}
        forceQueuedMessage={forceQueuedMessage}
      />
    </div>
  );
}
