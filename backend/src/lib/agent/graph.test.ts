import { describe, expect, it } from 'vitest';
import { SELF_REVIEW_INSTRUCTION } from './graph.js';

describe('agent self-review instruction', () => {
  it('keeps the self-review internal, silent, and focused on usefulness and verifiability', () => {
    expect(SELF_REVIEW_INSTRUCTION).toContain('Juste avant chaque réponse finale');
    expect(SELF_REVIEW_INSTRUCTION).toContain('mentalement');
    expect(SELF_REVIEW_INSTRUCTION).toContain('silencieuse');
    expect(SELF_REVIEW_INSTRUCTION).toContain('minimum de tokens');
    expect(SELF_REVIEW_INSTRUCTION).toContain('vérifiable');
    expect(SELF_REVIEW_INSTRUCTION).toContain('utile à l\'utilisateur');
    expect(SELF_REVIEW_INSTRUCTION).toContain('corrige-le immédiatement');
    expect(SELF_REVIEW_INSTRUCTION).toContain('N\'ajoute jamais de texte inutile');
  });
});
