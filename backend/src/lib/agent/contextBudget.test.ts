import { describe, it, expect } from 'vitest';
import { applyContextBudget, estimateTokens, getMaxInputTokensFromEnv } from './contextBudget.js';

describe('contextBudget', () => {
  it('does not trim when under budget', () => {
    const result = applyContextBudget([
      { role: 'user', content: 'Bonjour' },
      { role: 'assistant', content: 'Salut !' },
    ], { maxInputTokens: 2000 });

    expect(result.wasTrimmed).toBe(false);
    expect(result.messages).toHaveLength(2);
    expect(result.summary).toBeNull();
  });

  it('trims and injects a compressed summary when over budget', () => {
    const oversized = new Array(40).fill(null).map((_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `message-${index} ${'x'.repeat(300)}`,
    }));

    const result = applyContextBudget(oversized, {
      maxInputTokens: 900,
      minRecentMessages: 6,
      maxMessageChars: 800,
    });

    expect(result.wasTrimmed).toBe(true);
    expect(result.droppedMessages).toBeGreaterThan(0);
    expect(result.summary).not.toBeNull();
    expect(result.messages.some((m) => m.content.includes('[Contexte compressé]')) || result.summary !== null).toBe(true);
    expect(result.estimatedTokens).toBeLessThanOrEqual(900);
  });

  it('enforces minimum default for env parsing', () => {
    const old = process.env.CHAT_MAX_INPUT_TOKENS;
    process.env.CHAT_MAX_INPUT_TOKENS = '100';
    expect(getMaxInputTokensFromEnv()).toBe(64000);

    process.env.CHAT_MAX_INPUT_TOKENS = '28000';
    expect(getMaxInputTokensFromEnv()).toBe(28000);

    process.env.CHAT_MAX_INPUT_TOKENS = old;
  });

  it('estimates tokens using a deterministic character ratio', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});
