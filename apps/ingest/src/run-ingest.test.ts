import { appError, type Article, type Source, type SyncState } from '@scholarly-mcp/core';
import {
  createFakeClock,
  createInMemoryArticleStore,
  createInMemoryEnricher,
  createInMemorySource,
  createInMemorySyncStateStore,
  createTestLogger,
} from '@scholarly-mcp/testkit';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RecordLookup } from './prepare-record.js';
import { runIngest, type IngestDeps } from './run-ingest.js';
import { article, countingEmbedder, recordingSyncState } from './testing/ingest-fixtures.js';

const signal = new AbortController().signal;
const source = (articles: readonly Article[]) =>
  createInMemorySource({ articles, name: 'crossref', pageSize: 2 });

describe('runIngest', () => {
  let store: ReturnType<typeof createInMemoryArticleStore>;
  let syncState: ReturnType<typeof recordingSyncState>;
  let embedder: ReturnType<typeof countingEmbedder>;
  const clock = createFakeClock();

  beforeEach(() => {
    store = createInMemoryArticleStore();
    syncState = recordingSyncState(createInMemorySyncStateStore());
    embedder = countingEmbedder();
  });

  const deps = (from: Source, extra: Partial<IngestDeps> = {}): IngestDeps => ({
    source: from,
    embedder,
    writer: store,
    syncState,
    clock,
    logger: createTestLogger(),
    ...extra,
  });

  it('indexes every article of every page with embedded chunks', async () => {
    const report = await runIngest(deps(source([1, 2, 3].map((n) => article(n)))), 'full', signal);
    expect(report).toMatchObject({ pages: 2, fetched: 3, embedded: 3, written: 3 });
    const indexed = await store.findByDoi(article(3).doi, signal);
    expect(indexed?.title).toBe(article(3).title);
    expect(await store.findChunks([`${article(3).doi}#0`], signal)).toHaveLength(1);
  });

  it('checkpoints the cursor after every page and finishes without one', async () => {
    await runIngest(deps(source([1, 2, 3, 4, 5].map((n) => article(n)))), 'full', signal);
    expect(syncState.saved.map((state) => [state.lastRunStatus, state.cursor])).toEqual([
      ['running', undefined],
      ['running', '2'],
      ['running', '4'],
      ['running', undefined],
      ['succeeded', undefined],
    ]);
  });

  it('records a successful full run, so the next full run can be scheduled from it', async () => {
    await runIngest(deps(source([article(1)])), 'full', signal);
    expect((await syncState.load('crossref', signal))?.lastFullRunAt).toEqual(clock.now());
  });

  it('writes nothing and embeds nothing when the same records come again', async () => {
    const articles = [1, 2, 3].map((n) => article(n));
    await runIngest(deps(source(articles)), 'full', signal);
    const before = embedder.calls();
    const again = await runIngest(deps(source(articles)), 'incremental', signal);
    expect(again).toMatchObject({ fetched: 3, unchanged: 3, written: 0 });
    expect(embedder.calls()).toBe(before);
  });

  it('re-embeds only the article whose content changed', async () => {
    await runIngest(deps(source([article(1), article(2)])), 'full', signal);
    const again = await runIngest(deps(source([article(1), article(2, 1)])), 'incremental', signal);
    expect(again).toMatchObject({ unchanged: 1, embedded: 1, written: 1 });
    expect((await store.findByDoi(article(2).doi, signal))?.title).toBe(article(2, 1).title);
  });

  it('asks an incremental run for records updated since a day before the last window', async () => {
    const requests: (Date | undefined)[] = [];
    const spy: Source = {
      name: 'crossref',
      fetchPage: (request, s) => {
        requests.push(request.updatedSince);
        return source([article(1)]).fetchPage(request, s);
      },
    };
    await runIngest(deps(spy), 'full', signal);
    clock.advance(60 * 60 * 1000);
    await runIngest(deps(spy), 'incremental', signal);
    const lastWindowEnd = new Date(clock.now().getTime() - 60 * 60 * 1000);
    expect(requests).toEqual([undefined, new Date(lastWindowEnd.getTime() - 24 * 60 * 60 * 1000)]);
  });

  it('reuses the chunks of an earlier index when the content is unchanged', async () => {
    const previous = createInMemoryArticleStore();
    const old = createInMemoryArticleStore();
    await runIngest({ ...deps(source([article(1)])), writer: old }, 'full', signal);
    await previous.upsert(
      [{ article: article(1), chunks: await old.findChunks([`${article(1).doi}#0`], signal) }],
      signal,
    );
    const before = embedder.calls();
    const report = await runIngest(
      deps(source([article(1)]), {
        previous: {
          findRecord: async (doi, s) => {
            const found = await previous.findByDoi(doi, s);
            return found && { article: found, chunks: await previous.findChunks([`${doi}#0`], s) };
          },
        },
      }),
      'full',
      signal,
    );
    expect(report).toMatchObject({ reused: 1, embedded: 0, written: 1 });
    expect(embedder.calls()).toBe(before);
  });

  it('marks the run failed and keeps its cursor when a page fails, then resumes there', async () => {
    const articles = [1, 2, 3, 4].map((n) => article(n));
    let failOnce = true;
    const flaky: Source = {
      name: 'crossref',
      fetchPage: (request, s) => {
        if (request.cursor === '2' && failOnce) {
          failOnce = false;
          return Promise.reject(appError('SOURCE_UNAVAILABLE', 'Crossref is down'));
        }
        return source(articles).fetchPage(request, s);
      },
    };
    await expect(runIngest(deps(flaky), 'full', signal)).rejects.toThrow('Crossref is down');
    const failed = (await syncState.load('crossref', signal)) as SyncState;
    expect([failed.lastRunStatus, failed.cursor]).toEqual(['failed', '2']);

    const resumed = await runIngest(deps(flaky), 'full', signal);
    expect(resumed).toMatchObject({ resumed: true, pages: 1, fetched: 2 });
    expect(
      await store.findManyByDoi(
        articles.map((a) => a.doi),
        signal,
      ),
    ).toHaveLength(4);
  });

  it('refuses a source whose name is not a known chunk source', async () => {
    const unknown = createInMemorySource({ articles: [], name: 'memory' });
    await expect(runIngest(deps(unknown), 'full', signal)).rejects.toThrow();
  });

  describe('with an enricher', () => {
    const CC_BY = 'https://creativecommons.org/licenses/by/4.0/';
    const open = (n: number) => ({ ...article(n), isOpenAccess: true });
    const ref = (revision = '2024-08-01') => ({
      source: 'europepmc' as const,
      id: 'PMC1',
      licenseUrl: CC_BY,
      revision,
    });
    const methods = [{ label: 'Methods' as const, paragraphs: ['We enrolled 412 adults.'] }];
    const enricherFor = (sections = methods, revision?: string) =>
      createInMemoryEnricher([
        {
          doi: open(1).doi,
          enrichment: {
            subjects: [{ label: 'Atrial Fibrillation', origin: 'mesh' }],
            fullText: ref(revision),
          },
          ...(sections.length > 0 && { sections }),
        },
      ]);

    /** Reads every chunk of an article back from the in-memory store. */
    const lookupIn = (from: ReturnType<typeof createInMemoryArticleStore>): RecordLookup => ({
      findRecord: async (doi, s) => {
        const found = await from.findByDoi(doi, s);
        const ids = Array.from({ length: 20 }, (_, i) => `${doi}#${String(i)}`);
        return found && { article: found, chunks: await from.findChunks(ids, s) };
      },
    });

    it('indexes subjects and matching-only full-text chunks under the licence', async () => {
      const enricher = enricherFor();
      const report = await runIngest(
        deps(source([open(1), open(2)]), { enricher }),
        'full',
        signal,
      );
      expect(report).toMatchObject({ embedded: 2, withFullText: 1, fullTextSkipped: 0 });

      const record = await lookupIn(store).findRecord(open(1).doi, signal);
      expect(record?.article.subjects).toEqual([{ label: 'Atrial Fibrillation', origin: 'mesh' }]);
      expect(record?.article.fullText).toEqual(ref());
      const fullText = record?.chunks.filter((chunk) => chunk.origin === 'fulltext') ?? [];
      expect(fullText).toHaveLength(1);
      expect(fullText[0]).toMatchObject({
        source: 'europepmc',
        licenseUrl: CC_BY,
        section: 'Methods',
        text: 'We enrolled 412 adults.',
      });
      expect(record?.chunks.some((chunk) => chunk.origin !== 'fulltext')).toBe(true);
    });

    it('writes nothing and fetches no full text when the same records come again', async () => {
      const enricher = enricherFor();
      await runIngest(deps(source([open(1)]), { enricher }), 'full', signal);
      const again = await runIngest(deps(source([open(1)]), { enricher }), 'incremental', signal);
      expect(again).toMatchObject({ unchanged: 1, written: 0 });
      expect(enricher.fullTextFetches()).toBe(1);
    });

    it('indexes from metadata when the full text is missing, and not again next time', async () => {
      const enricher = enricherFor([]);
      const first = await runIngest(deps(source([open(1)]), { enricher }), 'full', signal);
      expect(first).toMatchObject({ embedded: 1, withFullText: 0, fullTextSkipped: 1 });
      const record = await lookupIn(store).findRecord(open(1).doi, signal);
      expect(record?.article).not.toHaveProperty('fullText');
      expect(record?.chunks.every((chunk) => chunk.origin !== 'fulltext')).toBe(true);

      const before = embedder.calls();
      const again = await runIngest(deps(source([open(1)]), { enricher }), 'incremental', signal);
      expect(again).toMatchObject({ unchanged: 1, written: 0, fullTextSkipped: 1 });
      expect(embedder.calls()).toBe(before);
    });

    it('reuses full-text chunks in a rebuild without fetching the text again', async () => {
      const enricher = enricherFor();
      await runIngest(deps(source([open(1)]), { enricher }), 'full', signal);
      const live = store;
      store = createInMemoryArticleStore();
      const rebuilt = await runIngest(
        deps(source([open(1)]), { enricher, writer: store, previous: lookupIn(live) }),
        'full',
        signal,
      );
      expect(rebuilt).toMatchObject({ reused: 1, embedded: 0, withFullText: 1 });
      expect(enricher.fullTextFetches()).toBe(1);
    });

    it('re-indexes when the full text gets a new revision', async () => {
      await runIngest(deps(source([open(1)]), { enricher: enricherFor() }), 'full', signal);
      const revised = enricherFor(methods, '2025-02-01');
      const again = await runIngest(
        deps(source([open(1)]), { enricher: revised }),
        'incremental',
        signal,
      );
      expect(again).toMatchObject({ embedded: 1, withFullText: 1 });
      expect((await store.findByDoi(open(1).doi, signal))?.fullText?.revision).toBe('2025-02-01');
    });

    it('drops full text and subjects when enrichment is turned off', async () => {
      await runIngest(deps(source([open(1)]), { enricher: enricherFor() }), 'full', signal);
      const off = await runIngest(deps(source([open(1)])), 'incremental', signal);
      expect(off).toMatchObject({ embedded: 1, withFullText: 0 });
      const record = await lookupIn(store).findRecord(open(1).doi, signal);
      expect(record?.article.subjects).toEqual([]);
      expect(record?.chunks.every((chunk) => chunk.origin !== 'fulltext')).toBe(true);
    });
  });
});
