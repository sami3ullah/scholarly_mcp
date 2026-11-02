import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appError, type Article, type Source } from '@scholarly-mcp/core';
import { buildPathOf, openIndexReader } from '@scholarly-mcp/store-sqlite';
import { createFakeClock, createInMemorySource } from '@scholarly-mcp/testkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ingestIndex, verifyLiveIndex, type IngestIndexDeps } from './ingest-index.js';
import { article, countingEmbedder } from './testing/ingest-fixtures.js';
import { createTestLogger } from './testing/test-logger.js';

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

  it('reuses the live embeddings on a full rebuild of unchanged articles', async () => {
    await ingestIndex('full', deps(numbered(4)), signal);
    const before = embedder.calls();
    const rebuild = await ingestIndex('full', deps(numbered(4)), signal);
    expect(rebuild.report).toMatchObject({ reused: 4, embedded: 0 });
    expect(embedder.calls()).toBe(before);
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
});
