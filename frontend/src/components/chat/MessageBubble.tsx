import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, Wrench } from 'lucide-react';
import type { Components } from 'react-markdown';

interface ToolCall {
  name: string;
  input?: unknown;
  result?: unknown;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  tools?: ToolCall[];
}

const CodeBlock = ({ inline, className, children, ...props }: React.ComponentPropsWithoutRef<'code'> & { inline?: boolean }) => {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');

  const handleCopy = () => {
    navigator.clipboard.writeText(String(children).replace(/\n$/, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!inline && match) {
    return (
      <div className="relative group rounded-lg overflow-hidden bg-[#1e1e1e] my-4 shadow-sm border border-zinc-800/50">
        <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d2d] text-zinc-400 text-xs font-mono border-b border-zinc-800">
          <span>{match[1]}</span>
          <button
            onClick={handleCopy}
            className="hover:text-white transition-colors focus:outline-none flex items-center gap-1.5 px-2 py-1 rounded hover:bg-zinc-700"
            title="Copier le code"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy code'}</span>
          </button>
        </div>
        <div className="p-4 overflow-x-auto text-sm text-zinc-50">
          <code className={className} {...props}>
            {children}
          </code>
        </div>
      </div>
    );
  }
  return (
    <code className="bg-muted px-1.5 py-0.5 rounded-md text-sm font-mono text-primary mx-0.5" {...props}>
      {children}
    </code>
  );
};

const components: Components = {
  code: CodeBlock as React.ElementType,
  table: ({ children }) => (
    <div className="overflow-x-auto my-4 rounded-lg border border-border shadow-sm">
      <table className="min-w-full divide-y divide-border bg-card">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
  th: ({ children }) => <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">{children}</th>,
  td: ({ children }) => <td className="px-4 py-3 text-sm text-foreground/90 whitespace-nowrap">{children}</td>,
  h1: ({ children }) => <h1 className="text-2xl font-bold mt-6 mb-4 pb-2 border-b border-border/50">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-bold mt-5 mb-3">{children}</h2>,
  h3: ({ children }) => <h3 className="text-lg font-bold mt-4 mb-2">{children}</h3>,
  p: ({ children }) => <p className="leading-relaxed mb-4 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc list-outside ml-5 mb-4 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-outside ml-5 mb-4 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ href, children }) => <a href={href} className="text-blue-500 hover:underline hover:text-blue-600 transition-colors" target="_blank" rel="noopener noreferrer">{children}</a>,
  blockquote: ({ children }) => <blockquote className="border-l-4 border-primary/20 pl-4 py-1 my-4 italic text-muted-foreground bg-muted/30 rounded-r-lg">{children}</blockquote>,
};

const MarkdownRenderer = React.memo(({ content }: { content: string }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
});

MarkdownRenderer.displayName = 'MarkdownRenderer';

const ToolExecutionLog = ({ tool }: { tool: ToolCall }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-3 rounded-lg border border-border/60 bg-muted/30 overflow-hidden shadow-sm">
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Wrench className="w-4 h-4 text-primary/70" />
          <span>Utilisation de l'outil <code className="text-primary bg-background px-1.5 py-0.5 rounded">{tool.name}</code></span>
        </div>
        <div className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded-full border border-border/50">
          {tool.result ? 'Terminé' : 'En cours...'}
        </div>
      </div>

      {expanded && (
        <div className="p-3 border-t border-border/60 text-xs font-mono bg-background/50 space-y-2">
          {tool.input && (
             <div>
               <div className="text-muted-foreground mb-1 uppercase tracking-wider text-[10px] font-semibold">Input</div>
               <pre className="bg-card p-2 rounded border border-border/50 overflow-x-auto text-foreground/80">{JSON.stringify(tool.input, null, 2)}</pre>
             </div>
          )}
          {tool.result && (
             <div>
               <div className="text-muted-foreground mb-1 mt-2 uppercase tracking-wider text-[10px] font-semibold">Result</div>
               <div className="bg-card p-2 rounded border border-border/50 max-h-40 overflow-y-auto break-words text-foreground/80">
                 {typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result)}
               </div>
             </div>
          )}
        </div>
      )}
    </div>
  );
};

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} mb-6 w-full`}>
      {message.role === 'assistant' && message.tools && message.tools.length > 0 && (
        <div className="flex flex-col w-full max-w-3xl">
          {message.tools.map((tool, tIdx) => (
            <ToolExecutionLog key={tIdx} tool={tool} />
          ))}
        </div>
      )}

      {message.content && (
        <div className="relative group w-full flex justify-center">
           <div className={`w-full max-w-3xl flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`
                  relative px-5 py-4 rounded-2xl max-w-[85%] md:max-w-[75%]
                  ${isUser
                    ? 'bg-[#1a1a1a] dark:bg-primary text-white dark:text-primary-foreground rounded-br-sm shadow-sm'
                    : 'bg-transparent text-foreground'
                  }
                `}
              >
                {!isUser && (
                  <div className="absolute -left-12 top-0 w-8 h-8 rounded-full border border-border flex items-center justify-center bg-card shadow-sm hidden md:flex">
                     <img src="/logo.png" alt="Bot" className="w-5 h-5" />
                  </div>
                )}

                {message.role === 'assistant' && (
                  <div className="absolute -bottom-8 left-0 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex gap-2">
                    <button
                      onClick={handleCopy}
                      className="p-1.5 text-muted-foreground hover:text-foreground transition-all flex items-center justify-center gap-1 text-xs"
                      title="Copier le message"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}

                <div className="text-sm md:text-base leading-relaxed break-words whitespace-pre-wrap">
                  {isUser ? (
                    message.content
                  ) : (
                    <div className="prose dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:my-0">
                      <MarkdownRenderer content={message.content} />
                    </div>
                  )}
                </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
