import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FULL_TEXT_MARKER,
  FULL_TEXT_REF,
  startHarness,
  structured,
  type Harness,
} from '../testing/server-harness.js';

/**
 * Full text is for matching only (ADR 0003, ADR 0024): its words, and the reference to it,
 * must never reach any tool response. The query below matches the full-text chunk through
 * words that are not the marker, so the marker can only appear by leaking.
 */
const CALLS: [string, Record<string, unknown>][] = [
  ['search_articles', { query: 'methods in detail' }],
  ['search_articles', { query: 'rivaroxaban dosing', limit: 10 }],
  ['search_articles', { query: '10.1055/a-1001' }],
  ['get_article', { doi: '10.1055/a-1001' }],
  ['find_related', { doi: '10.1055/a-1001', limit: 10 }],
  ['find_related', { doi: '10.1055/a-1003', limit: 10 }],
  ['get_journal', { issn: '0340-6245' }],
  ['cite', { doi: '10.1055/a-1001', style: 'bibtex' }],
  ['cite', { doi: '10.1055/a-1001', style: 'ris' }],
  ['check_access', { doi: '10.1055/a-1001' }],
];

const LEAKS = [FULL_TEXT_MARKER, FULL_TEXT_REF.id, FULL_TEXT_REF.revision];

describe('the full-text guardrail', () => {
  let harness: Harness;
  beforeAll(async () => {
    harness = await startHarness();
  });
  afterAll(async () => {
    await harness.close();
  });

  it('finds the article through its full text, labelled only by section', async () => {
    const result = await harness.call('search_articles', { query: 'methods in detail' });
    const cards = structured(result)['cards'] as { doi: string; whyMatched: string }[];
    expect(cards[0]).toMatchObject({
      doi: '10.1055/a-1001',
      whyMatched: expect.stringContaining('Methods (full text)') as string,
    });
  });

  it.each(CALLS)('keeps full text out of %s %j', async (name, args) => {
    const response = JSON.stringify(await harness.call(name, args));
    for (const leak of LEAKS) expect(response).not.toContain(leak);
  });

  it('exposes the full-text reference only as "full text indexed"', async () => {
    const result = structured(await harness.call('get_article', { doi: '10.1055/a-1001' }));
    expect(result['fullTextIndexed']).toBe(true);
    expect(JSON.stringify(result)).not.toContain('europepmc');
  });

  it('never returns full text for any query', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.string({ minLength: 1, maxLength: 60 }),
          fc.constantFrom('methods', 'detail', 'rivaroxaban methods', 'dosing in detail'),
        ),
        async (query) => {
          const response = JSON.stringify(await harness.call('search_articles', { query }));
          const typed = query.toLowerCase();
          for (const leak of LEAKS) {
            if (!typed.includes(leak.toLowerCase())) expect(response).not.toContain(leak);
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});
