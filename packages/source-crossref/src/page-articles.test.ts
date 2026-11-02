import type { Doi } from '@scholarly-mcp/core';
import { describe, expect, it, vi } from 'vitest';
import { LOOKUP_BATCH, pageArticles, type LookupWorks } from './page-articles.js';
import { aCrossrefWork } from './testing/a-crossref-work.js';

const now = new Date('2026-11-02T10:00:00Z');
const noLookup = () => Promise.reject(new Error('unexpected lookup'));

function notice(doi: string, retracts: string, deposited = '2026-11-01T12:00:00Z') {
  return aCrossrefWork({
    DOI: doi,
    title: ['Retraction Note: A trial'],
    'update-to': [{ DOI: retracts, type: 'retraction' }],
    deposited: { 'date-time': deposited },
  });
}

describe('pageArticles', () => {
  it('emits articles and counts what it skipped', async () => {
    const works = [aCrossrefWork(), aCrossrefWork({ DOI: '10.1055/a-2', type: 'book-chapter' })];
    const page = await pageArticles(works, now, noLookup);
    expect(page.articles.map((article) => article.doi)).toEqual(['10.1055/a-2236-8949']);
    expect(page.skipped).toEqual({ 'other-type': 1 });
  });

  it('marks an original on the same page retracted without looking it up', async () => {
    const original = aCrossrefWork({ DOI: '10.1055/a-1' });
    const page = await pageArticles(
      [original, notice('10.1055/n-1', '10.1055/A-1')],
      now,
      noLookup,
    );
    expect(page.articles).toMatchObject([
      { doi: '10.1055/a-1', isRetracted: true, sourceUpdatedAt: new Date('2026-11-01T12:00:00Z') },
    ]);
    expect(page.followedUp).toBe(0);
  });

  it('looks up an original that is not on the page, even if its record is not marked yet', async () => {
    const lookup = vi.fn((dois: readonly Doi[]) =>
      Promise.resolve(dois.map((DOI) => aCrossrefWork({ DOI, 'updated-by': [] }))),
    );
    const page = await pageArticles([notice('10.1055/n-1', '10.1055/a-1')], now, lookup);
    expect(lookup).toHaveBeenCalledWith(['10.1055/a-1']);
    expect(page.articles).toMatchObject([{ doi: '10.1055/a-1', isRetracted: true }]);
    expect(page).toMatchObject({ followedUp: 1, skipped: { notice: 1 } });
  });

  it('emits nothing for an original outside the source scope', async () => {
    const page = await pageArticles([notice('10.1055/n-1', '10.1016/x')], now, () =>
      Promise.resolve([]),
    );
    expect(page.articles).toEqual([]);
  });

  it('ignores lookup results it did not ask for', async () => {
    const stray = aCrossrefWork({ DOI: '10.1055/other' });
    const page = await pageArticles([notice('10.1055/n-1', '10.1055/a-1')], now, () =>
      Promise.resolve([stray]),
    );
    expect(page.articles).toEqual([]);
  });

  it('dates the retraction to the latest notice when several retract the same article', async () => {
    const works = [
      aCrossrefWork({ DOI: '10.1055/a-1', deposited: { 'date-time': '2026-01-01T00:00:00Z' } }),
      notice('10.1055/n-1', '10.1055/a-1', '2026-03-01T00:00:00Z'),
      notice('10.1055/n-2', '10.1055/a-1', '2026-05-01T00:00:00Z'),
    ];
    const page = await pageArticles(works, now, noLookup);
    expect(page.articles[0]?.sourceUpdatedAt).toEqual(new Date('2026-05-01T00:00:00Z'));
  });

  it(`looks up missing originals in batches of ${String(LOOKUP_BATCH)}`, async () => {
    const works = Array.from({ length: LOOKUP_BATCH + 1 }, (_, index) =>
      notice(`10.1055/n-${String(index)}`, `10.1055/a-${String(index)}`),
    );
    const lookup = vi.fn<LookupWorks>(() => Promise.resolve([]));
    await pageArticles(works, now, lookup);
    expect(lookup.mock.calls.map(([dois]) => dois.length)).toEqual([LOOKUP_BATCH, 1]);
  });
});
