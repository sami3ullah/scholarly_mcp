import { appError, type ArticleReader, type SessionStore } from '@scholarly-mcp/core';
import { createInMemoryArticleStore } from '@scholarly-mcp/testkit';
import { describe, expect, it } from 'vitest';
import { startHarness, structured, textOf } from '../testing/server-harness.js';

const failingReader = (error: Error): ArticleReader => ({
  findByDoi: () => Promise.reject(error),
  findManyByDoi: () => Promise.reject(error),
  findChunks: () => Promise.reject(error),
  findArticleChunks: () => Promise.reject(error),
  indexMeta: () => Promise.reject(error),
});

const brokenIndex = (error: Error) => {
  const empty = createInMemoryArticleStore();
  return { reader: failingReader(error), search: empty, journals: empty, version: () => undefined };
};

describe('tool errors', () => {
  it('answers INDEX_UNAVAILABLE with a fixed message that never names the file', async () => {
    const harness = await startHarness({
      overrides: {
        index: brokenIndex(
          appError('INDEX_UNAVAILABLE', 'No index file at /srv/secret/index.sqlite'),
        ),
      },
    });
    const results = await Promise.all([
      harness.call('search_articles', { query: 'rivaroxaban' }),
      harness.call('get_article', { doi: '10.1055/a-1001' }),
    ]);
    await harness.close();
    for (const result of results) {
      expect(result.isError).toBe(true);
      expect(structured(result)).toMatchObject({
        code: 'INDEX_UNAVAILABLE',
        message: 'The search index is not available right now; retry shortly',
      });
      expect(JSON.stringify(result)).not.toContain('/srv/secret');
    }
  });

  it('answers an unexpected failure as INTERNAL without its message or stack, and logs it', async () => {
    const harness = await startHarness({
      overrides: { index: brokenIndex(new Error('SQLITE_CORRUPT at /srv/secret')) },
    });
    const result = await harness.call('cite', { doi: '10.1055/a-1001' });
    await harness.close();
    expect(structured(result)['code']).toBe('INTERNAL');
    expect(JSON.stringify(result)).not.toMatch(/SQLITE_CORRUPT|\/srv\/secret|at .*\.ts/);
    expect(harness.logs).toContainEqual(
      expect.objectContaining({ level: 'error', message: 'Tool failed unexpectedly' }),
    );
  });

  it('answers TIMEOUT when a search runs over its budget', async () => {
    const harness = await startHarness({
      overrides: {
        searchOptions: { budgetMs: 20 },
        embedder: {
          embedQuery: () =>
            new Promise((resolve) =>
              setTimeout(() => {
                resolve(new Float32Array(384));
              }, 200),
            ),
        },
      },
    });
    const result = await harness.call('search_articles', { query: 'rivaroxaban' });
    await harness.close();
    expect(structured(result)).toMatchObject({ code: 'TIMEOUT' });
    expect(textOf(result)).toContain('narrow the query');
  });

  it('still answers with DOI links when landing sessions cannot be stored', async () => {
    const failing: SessionStore = {
      save: () => Promise.reject(new Error('disk full')),
      find: () => Promise.resolve(undefined),
      recordVisit: () => Promise.resolve(),
      deleteExpired: () => Promise.resolve(0),
    };
    const harness = await startHarness({ overrides: { sessions: failing } });
    const result = await harness.call('search_articles', { query: 'rivaroxaban dosing' });
    await harness.close();
    const [card] = structured(result)['cards'] as { url: string; doi: string }[];
    const url = new URL(card?.url ?? '');
    expect(result.isError).not.toBe(true);
    expect(url.searchParams.has('t')).toBe(false);
    expect(url.searchParams.get('doi')).toBe(card?.doi);
    expect(structured(result)).not.toHaveProperty('collectionUrl');
    expect(harness.logs).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        message: 'Landing session not stored; links fall back to the DOI',
      }),
    );
  });

  it('logs every call with its tool, outcome and duration, and errors by code', async () => {
    const harness = await startHarness();
    await harness.call('get_article', { doi: '10.1055/unknown' });
    await harness.close();
    expect(harness.logs.at(-1)).toMatchObject({
      level: 'info',
      message: 'Tool call failed',
      fields: { tool: 'get_article', status: 'error', code: 'NOT_FOUND', durationMs: 0 },
    });
  });
});
