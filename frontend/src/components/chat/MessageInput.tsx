import React from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Mic, X, Zap } from 'lucide-react';

interface MessageInputProps {
  input: string;
  setInput: (value: string) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleMicrophoneClick: () => void;
  enqueueMessage: () => void;
  isListening: boolean;
  queuedMessages: string[];
  cancelQueuedMessage: (index: number) => void;
  forceQueuedMessage: (index: number) => void;
}

export function MessageInput({
  input,
  setInput,
  handleKeyDown,
  handleMicrophoneClick,
  enqueueMessage,
  isListening,
  queuedMessages,
  cancelQueuedMessage,
  forceQueuedMessage
}: MessageInputProps) {

  return (
    <div className="p-4 bg-transparent">
      <div className="max-w-3xl mx-auto mb-3">
        {queuedMessages.length > 0 && (
          <div className="mt-3 rounded-xl border border-border bg-card/80 backdrop-blur-sm p-2 space-y-2 shadow-sm">
            {queuedMessages.map((queuedMessage, idx) => (
              <div key={`${queuedMessage}-${idx}`} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
                <span className="text-xs text-muted-foreground truncate font-medium">
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
                      className="h-7 w-7"
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
                    className="h-7 w-7 hover:bg-destructive/10"
                  >
                    <X className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="max-w-3xl mx-auto relative flex items-end shadow-md border border-border/80 rounded-2xl bg-card/90 backdrop-blur-xl focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 focus-within:shadow-[0_0_15px_rgba(0,0,0,0.04)] dark:focus-within:shadow-[0_0_15px_rgba(255,255,255,0.04)] transition-all duration-300">
        <Textarea
          value={input}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message NudgeBot..."
          className="border-0 focus-visible:ring-0 resize-none min-h-[56px] max-h-48 py-4 px-5 bg-transparent shadow-none text-base w-full"
          rows={1}
        />
        <div className="p-2 h-full flex items-end gap-1.5 shrink-0">
          <Button
            size="icon"
            className={`rounded-xl h-10 w-10 transition-all duration-200 hover:scale-105 active:scale-95 ${isListening ? 'bg-foreground text-background animate-pulse shadow-[0_0_12px_rgba(0,0,0,0.15)] dark:shadow-[0_0_12px_rgba(255,255,255,0.15)]' : 'bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            onClick={handleMicrophoneClick}
            title="Dictée vocale"
            variant="ghost"
          >
            <Mic className="w-5 h-5" />
          </Button>
          <Button
            size="icon"
            className={`rounded-xl h-10 w-10 transition-all duration-200 ${input.trim() ? 'bg-primary text-primary-foreground hover:opacity-90 hover:scale-105 active:scale-95 shadow-sm' : 'bg-muted text-muted-foreground opacity-50 scale-95 pointer-events-none'}`}
            disabled={!input.trim()}
            onClick={enqueueMessage}
          >
            <Send className="w-4 h-4 ml-0.5" />
          </Button>
        </div>
      </div>
      <div className="text-center mt-3 text-[11px] text-muted-foreground">
        NudgeBot can make mistakes. Consider verifying important information.
      </div>
    </div>
  );
}
