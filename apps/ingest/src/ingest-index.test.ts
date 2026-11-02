import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appError, type Article, type Source } from '@scholarly-mcp/core';
import { buildPathOf, openDatabase, openIndexReader } from '@scholarly-mcp/store-sqlite';
import {
  createFakeClock,
  createInMemoryEnricher,
  createInMemorySource,
  createTestLogger,
} from '@scholarly-mcp/testkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  extractSubset,
  ingestIndex,
  purgeLicense,
  reembedIndex,
  verifyLiveIndex,
  type IngestIndexDeps,
} from './ingest-index.js';
import { article, countingEmbedder, otherModelEmbedder } from './testing/ingest-fixtures.js';

const signal = new AbortController().signal;
const numbered = (count: number) => Array.from({ length: count }, (_, i) => article(i + 1));

describe('ingestIndex on SQLite files', () => {
  let dir: string;
  let indexPath: string;
  let embedder: ReturnType<typeof countingEmbedder>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ingest-'));
    indexPath = join(dir, 'index.sqlite');
    embedder = countingEmbedder();
  });
  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  const deps = (articles: readonly Article[] | Source): IngestIndexDeps => ({
    indexPath,
    fullRunDays: 7,
    source: Array.isArray(articles)
      ? createInMemorySource({ articles, name: 'crossref', pageSize: 3 })
      : (articles as Source),
    loadEmbedder: () => Promise.resolve(embedder),
    clock: createFakeClock(),
    logger: createTestLogger(),
  });

  it('builds the index from scratch, then a second run changes 0 rows and verify passes', async () => {
    const first = await ingestIndex('incremental', deps(numbered(7)), signal);
    expect(first).toMatchObject({ plan: { kind: 'full' }, committed: true });
    expect(first.verify).toMatchObject({ ok: true, articleCount: 7 });

    const second = await ingestIndex('incremental', deps(numbered(7)), signal);
    expect(second).toMatchObject({ plan: { kind: 'incremental' }, committed: true });
    expect(second.report).toMatchObject({ fetched: 7, unchanged: 7, written: 0 });

    expect((await verifyLiveIndex(indexPath, embedder.modelVersion, signal)).ok).toBe(true);
    const reader = openIndexReader(indexPath, embedder.modelVersion);
    expect(reader.meta()).toMatchObject({ articleCount: 7, chunkCount: 7 });
    reader.close();
  });

  it('rebuilds in full with the new vector size when the embedding model changed', async () => {
    await ingestIndex('incremental', deps(numbered(3)), signal);
    const other = otherModelEmbedder();
    const outcome = await ingestIndex(
      'incremental',
      { ...deps(numbered(3)), loadEmbedder: () => Promise.resolve(other) },
      signal,
    );
    expect(outcome).toMatchObject({
      plan: { kind: 'full', reason: 'embedding model changed' },
      report: { embedded: 3, reused: 0 },
      committed: true,
    });
    const reader = openIndexReader(indexPath, other.modelVersion);
    const [chunk] = await reader.reader.findArticleChunks(article(1).doi, signal);
    expect(chunk?.embedding).toHaveLength(other.dimensions);
    reader.close();
  });

  it('reuses the live embeddings on a full rebuild of unchanged articles', async () => {
    await ingestIndex('full', deps(numbered(4)), signal);
    const before = embedder.calls();
    const rebuild = await ingestIndex('full', deps(numbered(4)), signal);
    expect(rebuild.report).toMatchObject({ reused: 4, embedded: 0 });
    expect(embedder.calls()).toBe(before);
  });

  it('rebuilds an index with an older layout in full, still guarding against a shrink', async () => {
    await ingestIndex('full', deps(numbered(10)), signal);
    const db = openDatabase(indexPath);
    db.pragma('user_version = 1');
    db.close();
    const shrunk = await ingestIndex('incremental', deps(numbered(5)), signal);
    expect(shrunk).toMatchObject({
      plan: { kind: 'full', reason: 'index layout changed' },
      committed: false,
    });
    const rebuilt = await ingestIndex('incremental', deps(numbered(10)), signal);
    expect(rebuilt).toMatchObject({ committed: true, report: { embedded: 10, reused: 0 } });
  });

  it('keeps the live index when the new one shrank too much', async () => {
    await ingestIndex('full', deps(numbered(10)), signal);
    const shrunk = await ingestIndex('full', deps(numbered(5)), signal);
    expect(shrunk.committed).toBe(false);
    expect(existsSync(buildPathOf(indexPath))).toBe(false);
    const reader = openIndexReader(indexPath, embedder.modelVersion);
    expect(reader.meta().articleCount).toBe(10);
    reader.close();
  });

  it('keeps a failed build and resumes it on the next run', async () => {
    const articles = numbered(6);
    let failOnce = true;
    const flaky: Source = {
      name: 'crossref',
      fetchPage: (request, s) => {
        if (request.cursor !== undefined && failOnce) {
          failOnce = false;
          return Promise.reject(appError('SOURCE_UNAVAILABLE', 'Crossref is down'));
        }
        return createInMemorySource({ articles, name: 'crossref', pageSize: 3 }).fetchPage(
          request,
          s,
        );
      },
    };
    await expect(ingestIndex('full', deps(flaky), signal)).rejects.toThrow('Crossref is down');
    expect(existsSync(indexPath)).toBe(false);
    expect(existsSync(buildPathOf(indexPath))).toBe(true);

    const resumed = await ingestIndex('full', deps(flaky), signal);
    expect(resumed).toMatchObject({ committed: true, report: { resumed: true, fetched: 3 } });
    expect(resumed.verify.articleCount).toBe(6);
  });

  it('fails verify on a missing index without creating one', async () => {
    await expect(verifyLiveIndex(indexPath, embedder.modelVersion, signal)).rejects.toThrow();
    expect(existsSync(indexPath)).toBe(false);
  });

  describe('purgeLicense', () => {
    const CC_BY_NC_ND = 'https://creativecommons.org/licenses/by-nc-nd/4.0/';
    const purgeDeps = (
      allowlist: readonly string[] = ['https://creativecommons.org/licenses/by/4.0/'],
    ) => ({
      indexPath,
      allowlist,
      model: { version: embedder.modelVersion, dimensions: embedder.dimensions },
      clock: createFakeClock(),
      logger: createTestLogger(),
    });

    async function indexWithFullText() {
      const open = { ...article(1), isOpenAccess: true };
      const enricher = createInMemoryEnricher([
        {
          doi: open.doi,
          enrichment: {
            subjects: [],
            fullText: { source: 'europepmc', id: 'PMC1', licenseUrl: CC_BY_NC_ND, revision: '1' },
          },
          sections: [{ label: 'Methods', paragraphs: ['Thrombectomy registry methods.'] }],
        },
      ]);
      await ingestIndex('full', { ...deps([open, article(2)]), enricher }, signal);
    }

    const fullTextChunks = () => {
      const db = openDatabase(indexPath, { readonly: true });
      const count = Number(
        db.prepare("SELECT count(*) FROM chunks WHERE origin = 'fulltext'").pluck().get(),
      );
      db.close();
      return count;
    };

    it('removes the licence’s full text through a verified build', async () => {
      await indexWithFullText();
      expect(fullTextChunks()).toBe(1);

      const outcome = await purgeLicense(CC_BY_NC_ND, purgeDeps(), signal);
      expect(outcome).toMatchObject({ purged: { articles: 1, chunks: 1 }, committed: true });
      expect(outcome.verify.ok).toBe(true);
      expect(fullTextChunks()).toBe(0);
      expect(existsSync(buildPathOf(indexPath))).toBe(false);
    });

    it('refuses a licence that is still on the allowlist', async () => {
      await indexWithFullText();
      await expect(
        purgeLicense(CC_BY_NC_ND, purgeDeps([CC_BY_NC_ND.replace('https', 'http')]), signal),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      expect(fullTextChunks()).toBe(1);
    });
  });

  describe('extractSubset', () => {
    const subsetDeps = () => ({
      sourcePath: indexPath,
      indexPath: join(dir, 'subset.sqlite'),
      model: { version: embedder.modelVersion, dimensions: embedder.dimensions },
      clock: createFakeClock(),
      logger: createTestLogger(),
    });

    it('copies the chosen articles with their embeddings into a verified index', async () => {
      await ingestIndex('full', deps(numbered(5)), signal);
      const before = embedder.calls();
      const [one, three] = [article(1).doi, article(3).doi];

      const outcome = await extractSubset([one, three, '10.1055/missing'], subsetDeps(), signal);
      expect(outcome).toMatchObject({ written: 2, missing: ['10.1055/missing'], committed: true });
      expect(outcome.verify).toMatchObject({ ok: true, articleCount: 2 });
      expect(embedder.calls()).toBe(before);

      const subset = openIndexReader(subsetDeps().indexPath, embedder.modelVersion);
      expect(subset.meta()).toMatchObject({ articleCount: 2 });
      const found = await subset.reader.findManyByDoi([one, three], signal);
      expect(found.map(({ doi }) => doi).sort()).toEqual([one, three].sort());
      subset.close();
    });

    it('refuses a source index built with another model', async () => {
      await ingestIndex('full', deps(numbered(2)), signal);
      await expect(
        extractSubset(
          [article(1).doi],
          { ...subsetDeps(), model: { version: 'other@1', dimensions: 384 } },
          signal,
        ),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
      expect(existsSync(subsetDeps().indexPath)).toBe(false);
    });
  });

  describe('reembedIndex', () => {
    const reembedDeps = (model = otherModelEmbedder()) => ({
      sourcePath: indexPath,
      indexPath: join(dir, 'reembedded.sqlite'),
      embedder: model,
      clock: createFakeClock(),
      logger: createTestLogger(),
    });

    it('embeds every chunk again with the new model, chunking unchanged', async () => {
      await ingestIndex('full', deps(numbered(4)), signal);
      const deps2 = reembedDeps();
      const outcome = await reembedIndex(deps2, signal);
      expect(outcome).toMatchObject({ written: 4, kept: 0, chunks: 4, committed: true });
      expect(outcome.verify.ok).toBe(true);

      const source = openIndexReader(indexPath, embedder.modelVersion);
      const copy = openIndexReader(deps2.indexPath, deps2.embedder.modelVersion);
      const [before] = await source.reader.findArticleChunks(article(2).doi, signal);
      const [after] = await copy.reader.findArticleChunks(article(2).doi, signal);
      expect(after).toMatchObject({
        id: before?.id,
        text: before?.text,
        modelVersion: 'other-model@1',
      });
      expect(after?.embedding).toHaveLength(deps2.embedder.dimensions);
      expect(deps2.embedder.texts()).toContain(`${article(2).title}\n\n${before?.text ?? ''}`);
      source.close();
      copy.close();
    });

    it('keeps the articles an interrupted run already re-embedded', async () => {
      await ingestIndex('full', deps(numbered(3)), signal);
      const controller = new AbortController();
      const first = otherModelEmbedder({
        onEmbed: () => {
          controller.abort();
        },
      });
      await expect(reembedIndex(reembedDeps(first), controller.signal)).rejects.toThrow();

      const outcome = await reembedIndex(reembedDeps(), signal);
      expect(outcome).toMatchObject({ committed: true });
      expect(outcome.written + outcome.kept).toBe(3);
    });
  });
});
