import { describe, expect, it } from 'vitest';
import { SELF_REVIEW_INSTRUCTION } from './graph.js';

describe('agent self-review instruction', () => {
  it('keeps the self-review concise, internal, and focused on usefulness and verifiability', () => {
    expect(SELF_REVIEW_INSTRUCTION).toContain('Micro-vérification silencieuse');
    expect(SELF_REVIEW_INSTRUCTION).toContain('vérifiable et utile');
    expect(SELF_REVIEW_INSTRUCTION).toContain('NE l\'affirme PAS');
    expect(SELF_REVIEW_INSTRUCTION).toContain('Je ne suis pas sûr');
    expect(SELF_REVIEW_INSTRUCTION).toContain('Je ne peux pas vérifier');
    expect(SELF_REVIEW_INSTRUCTION).toContain('demande la précision manquante');
    expect(SELF_REVIEW_INSTRUCTION).toContain('Self-review invisible');
    expect(SELF_REVIEW_INSTRUCTION.length).toBeLessThan(500);
  });
});
