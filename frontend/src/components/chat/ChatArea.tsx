import React, { RefObject } from 'react';
import { Wrench, Send, Menu, Sparkles } from 'lucide-react';
import { MessageBubble, Message } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { Button } from '@/components/ui/button';

interface ChatAreaProps {
  messages: Message[];
  isThinking: boolean;
  activeToolName: string | null;
  isRequestInFlight: boolean;
  queuedMessages: string[];
  messagesEndRef: RefObject<HTMLDivElement | null>;
  setIsMobileMenuOpen: (open: boolean) => void;
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

export function ChatArea({
  messages,
  isThinking,
  activeToolName,
  isRequestInFlight,
  queuedMessages,
  messagesEndRef,
  setIsMobileMenuOpen,
  input,
  setInput,
  handleKeyDown,
  handleMicrophoneClick,
  enqueueMessage,
  isListening,
  cancelQueuedMessage,
  forceQueuedMessage
}: ChatAreaProps) {

  return (
    <div className="flex-1 flex flex-col relative max-w-full h-full bg-background">

      {/* Mobile Top Bar */}
      <div className="md:hidden sticky top-0 z-20 border-b border-border/40 bg-background/80 backdrop-blur-xl px-3 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" onClick={() => setIsMobileMenuOpen(true)} aria-label="Open menu">
              <Menu className="w-5 h-5 text-foreground" />
            </Button>
            <span className="font-semibold text-foreground tracking-tight">NudgeBot</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 md:p-6 scroll-smooth">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
               <img src="/logo.png" alt="Logo" className="w-8 h-8 opacity-80" />
            </div>
            <p className="text-xl font-medium text-foreground/80">How can I help you today?</p>
          </div>
        ) : (
          <div className="flex flex-col space-y-6 md:space-y-8 max-w-4xl mx-auto">
            {messages.map((msg, i) => (
              <MessageBubble key={i} message={msg} />
            ))}
          </div>
        )}

        {isThinking && (
          <div className="flex justify-start max-w-4xl mx-auto mt-6 animate-bounce-in">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg border border-border/80 flex items-center justify-center bg-card shadow-sm animate-float hidden md:flex select-none">
                <img src="/logo.png" alt="Thinking Bot" className="w-5 h-5 animate-spin-slow" />
              </div>
              <div className="flex space-x-2 items-center justify-center px-4 py-2.5 rounded-2xl rounded-bl-sm bg-card border border-border/80 shadow-sm">
                <span className="text-xs text-muted-foreground mr-1 font-semibold select-none">Thinking</span>
                <div className="w-2 h-2 bg-foreground/30 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-2 h-2 bg-foreground/60 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 bg-foreground rounded-full animate-bounce"></div>
              </div>
            </div>
          </div>
        )}

        {/* Status Indicators */}
        <div className="max-w-3xl mx-auto mt-4 mb-2 flex flex-wrap gap-2 justify-center">
          {activeToolName && (
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 backdrop-blur px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
              <Wrench className="w-3.5 h-3.5 text-primary/70 animate-pulse" />
              <span>Using tool <span className="font-mono font-medium text-foreground/80">{activeToolName}</span>...</span>
            </div>
          )}
          {queuedMessages.length > 0 && !activeToolName && !isThinking && isRequestInFlight && (
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 backdrop-blur px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
              <Send className="w-3.5 h-3.5 text-primary/70" />
              <span>Sending...</span>
            </div>
          )}
        </div>

        <div ref={messagesEndRef} className="h-4" />
      </div>

      <div className="bg-gradient-to-t from-background via-background to-transparent pt-6 md:pt-10">
        <MessageInput
           input={input}
           setInput={setInput}
           handleKeyDown={handleKeyDown}
           handleMicrophoneClick={handleMicrophoneClick}
           enqueueMessage={enqueueMessage}
           isListening={isListening}
           queuedMessages={queuedMessages}
           cancelQueuedMessage={cancelQueuedMessage}
           forceQueuedMessage={forceQueuedMessage}
        />
      </div>
    </div>
  );
}
