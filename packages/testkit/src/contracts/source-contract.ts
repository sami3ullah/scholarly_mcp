import { articleSchema, normalizeDoi, type Source } from '@scholarly-mcp/core';
import { describe, expect, it } from 'vitest';

/** Options for {@link runSourceContract}. */
export interface SourceContractOptions {
  /** Returns a source backed by recorded data that spans at least two pages. */
  readonly create: () => Source | Promise<Source>;
  /** An instant inside the recorded data, used to check incremental syncs. */
  readonly updatedSince: Date;
  /** Stops a broken cursor from looping forever. */
  readonly maxPages?: number;
}

const signal = new AbortController().signal;

/**
 * The behaviour every source must share. Sources run against recorded responses, never the
 * network, so this suite only checks properties that hold for any data.
 */
export function runSourceContract(name: string, options: SourceContractOptions): void {
  const { create, updatedSince, maxPages = 100 } = options;

  async function fetchAll(since?: Date) {
    const source = await create();
    const pages = [];
    let cursor: string | undefined;
    do {
      const page = await source.fetchPage(
        { ...(cursor !== undefined && { cursor }), ...(since && { updatedSince: since }) },
        signal,
      );
      pages.push(page);
      cursor = page.nextCursor;
    } while (cursor !== undefined && pages.length < maxPages);
    expect(cursor, 'paging did not finish').toBeUndefined();
    return pages;
  }

  describe(`${name} satisfies the source contract`, () => {
    it('has a stable name', async () => {
      expect((await create()).name).toMatch(/^[a-z][a-z0-9-]*$/);
    });

    it('pages to the end, emitting valid canonical articles once each', async () => {
      const pages = await fetchAll();
      const articles = pages.flatMap((page) => page.articles);
      expect(pages.length).toBeGreaterThan(1);
      for (const article of articles) {
        expect(articleSchema.safeParse(article).success).toBe(true);
        expect(normalizeDoi(article.doi)).toBe(article.doi);
      }
      const dois = articles.map((article) => article.doi);
      expect(new Set(dois).size).toBe(dois.length);
    });

    it('returns only records updated since the given instant', async () => {
      const articles = (await fetchAll(updatedSince)).flatMap((page) => page.articles);
      for (const article of articles) {
        expect(article.sourceUpdatedAt.getTime()).toBeGreaterThanOrEqual(updatedSince.getTime());
      }
    });

    it('rejects when the caller has already aborted', async () => {
      const source = await create();
      await expect(source.fetchPage({}, AbortSignal.abort())).rejects.toThrow();
    });
  });
}
