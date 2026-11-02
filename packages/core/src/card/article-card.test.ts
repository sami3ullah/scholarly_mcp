import { describe, expect, it } from 'vitest';
import { TEASER_MAX_LENGTH, articleCardSchema } from './article-card.js';

const valid = {
  doi: '10.1055/a-1',
  title: 'Rivaroxaban dosing in atrial fibrillation',
  journal: 'Thrombosis and Haemostasis',
  year: 2025,
  teaser: 'Lower doses were not associated with more strokes.',
  whyMatched: 'matched in Results: rivaroxaban dosing',
  access: 'open',
  url: 'https://example.org/mcp/landing?t=AAAAAAAAAAAAAAAAAAAAAA&doi=10.1055%2Fa-1',
};

describe('articleCardSchema', () => {
  it('accepts a card without an author or teaser', () => {
    expect(articleCardSchema.safeParse({ ...valid, teaser: '' }).success).toBe(true);
  });

  it('rejects a teaser longer than 280 characters', () => {
    const teaser = 'x'.repeat(TEASER_MAX_LENGTH + 1);
    expect(articleCardSchema.safeParse({ ...valid, teaser }).success).toBe(false);
  });

  it('only allows the card-level access values', () => {
    expect(articleCardSchema.safeParse({ ...valid, access: 'institution' }).success).toBe(false);
  });
});
