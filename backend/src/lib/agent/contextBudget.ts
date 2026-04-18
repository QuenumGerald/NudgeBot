const DEFAULT_MAX_INPUT_TOKENS = 64000;
const DEFAULT_MAX_MESSAGE_CHARS = 6000;
const DEFAULT_RECENT_MESSAGES = 20;
const CHARS_PER_TOKEN = 4;

export type ChatInputMessage = {
  role?: string;
  content?: string;
};

export type ContextBudgetResult = {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  estimatedTokens: number;
  wasTrimmed: boolean;
  droppedMessages: number;
  summary: string | null;
};

const sanitizeRole = (role?: string): 'user' | 'assistant' =>
  role === 'assistant' ? 'assistant' : 'user';

const sanitizeContent = (content?: string, maxChars: number = DEFAULT_MAX_MESSAGE_CHARS): string => {
  const normalized = String(content ?? '')
    .replace(/\u0000/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1))}…`;
};

export const estimateTokens = (text: string): number => {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
};

const buildDroppedSummary = (
  dropped: Array<{ role: 'user' | 'assistant'; content: string }>
): string | null => {
  if (!dropped.length) return null;

  const sample = dropped
    .slice(-12)
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'Utilisateur'}: ${m.content.slice(0, 220)}`)
    .join('\n');

  return [
    `Résumé compressé de ${dropped.length} message(s) précédents:`,
    sample,
  ].join('\n');
};

export const applyContextBudget = (
  inputMessages: ChatInputMessage[],
  options?: {
    maxInputTokens?: number;
    maxMessageChars?: number;
    minRecentMessages?: number;
  }
): ContextBudgetResult => {
  const maxInputTokens = options?.maxInputTokens ?? DEFAULT_MAX_INPUT_TOKENS;
  const maxMessageChars = options?.maxMessageChars ?? DEFAULT_MAX_MESSAGE_CHARS;
  const minRecentMessages = options?.minRecentMessages ?? DEFAULT_RECENT_MESSAGES;

  const normalized = inputMessages
    .map((m) => ({
      role: sanitizeRole(m.role),
      content: sanitizeContent(m.content, maxMessageChars),
    }))
    .filter((m) => Boolean(m.content));

  const tokenTotal = normalized.reduce((acc, m) => acc + estimateTokens(m.content), 0);
  if (tokenTotal <= maxInputTokens) {
    return {
      messages: normalized,
      estimatedTokens: tokenTotal,
      wasTrimmed: false,
      droppedMessages: 0,
      summary: null,
    };
  }

  const kept: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let keptTokens = 0;
  const maxKeptTokens = Math.max(1, Math.floor(maxInputTokens * 0.75));

  for (let i = normalized.length - 1; i >= 0; i -= 1) {
    const m = normalized[i];
    const msgTokens = estimateTokens(m.content);
    const mustKeepRecent = kept.length < minRecentMessages;
    const fits = keptTokens + msgTokens <= maxKeptTokens;

    if (mustKeepRecent || fits || kept.length === 0) {
      kept.unshift(m);
      keptTokens += msgTokens;
      continue;
    }

    break;
  }

  const droppedCount = Math.max(0, normalized.length - kept.length);
  const dropped = normalized.slice(0, droppedCount);
  const summary = buildDroppedSummary(dropped);

  if (summary) {
    const summaryTokens = estimateTokens(summary);
    if (keptTokens + summaryTokens <= maxInputTokens) {
      kept.unshift({
        role: 'user',
        content: `[Contexte compressé]\n${summary}`,
      });
      keptTokens += summaryTokens;
    }
  }

  return {
    messages: kept,
    estimatedTokens: keptTokens,
    wasTrimmed: true,
    droppedMessages: droppedCount,
    summary,
  };
};

export const getMaxInputTokensFromEnv = (): number => {
  const raw = (process.env.CHAT_MAX_INPUT_TOKENS || '').trim();
  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed < 4000) {
    return DEFAULT_MAX_INPUT_TOKENS;
  }

  return parsed;
};
