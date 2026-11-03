import {
  isAppError,
  type ArticleRecord,
  type BuildKind,
  type Doi,
  type IndexMeta,
  type IndexReader,
  type IndexStorage,
} from '@scholarly-mcp/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { aChunk } from '../builders/a-chunk.js';
import { anArticle } from '../builders/an-article.js';
import { TEST_EMBEDDING_DIMENSIONS } from '../fakes/fake-embedder.js';

/** One empty storage, and the server's reader over it for a model version. */
export interface IndexStorageUnderTest {
  readonly storage: IndexStorage;
  readonly openReader: (modelVersion: string, signal: AbortSignal) => Promise<IndexReader>;
}

const signal = new AbortController().signal;
const MODEL = 'multilingual-e5-small@test';
const LICENSE = 'https://creativecommons.org/licenses/by/4.0/';
const now = new Date('2026-11-03T10:00:00Z');

const doiOf = (n: number) => `10.1055/a-${String(n)}` as Doi;

function recordNumber(n: number, options: { fullText?: boolean } = {}): ArticleRecord {
  const doi = doiOf(n);
  const chunk = aChunk().of(doi).withEmbedding(1, n);
  return {
    article: anArticle()
      .withDoi(doi)
      .withTitle(`Study ${String(n)} of anticoagulation`)
      .build(),
    chunks: [
      chunk.build(),
      ...(options.fullText === true ? [chunk.of(doi, 1).fromFullText(LICENSE).build()] : []),
    ],
  };
}

function metaFor(version: string, records: readonly ArticleRecord[], modelVersion = MODEL) {
  return {
    version,
    modelVersion,
    articleCount: records.length,
    chunkCount: records.reduce((sum, { chunks }) => sum + chunks.length, 0),
    builtAt: now,
  } satisfies IndexMeta;
}

const codeOf = (work: Promise<unknown>) =>
  work.then(
    () => undefined,
    (error: unknown) => (isAppError(error) ? error.code : 'not an AppError'),
  );

/**
 * What every index storage must share (ADR 0034): builds that stay invisible until they are
 * committed, resumed or dropped like the SQLite file builds, and a server reader that
 * follows each commit and refuses another model's index.
 */
export function runIndexStorageContract(
  name: string,
  create: () => Promise<IndexStorageUnderTest>,
): void {
  describe(`${name} satisfies the index storage contract`, () => {
    let storage: IndexStorage;
    let openReader: IndexStorageUnderTest['openReader'];
    beforeEach(async () => {
      ({ storage, openReader } = await create());
    });

    const begin = (kind: BuildKind) =>
      storage.beginBuild({ kind, now, dimensions: TEST_EMBEDDING_DIMENSIONS }, signal);

    async function commitFull(version: string, records: readonly ArticleRecord[], model = MODEL) {
      const build = await begin('full');
      await build.store.writer.upsert(records, signal);
      await build.commit(metaFor(version, records, model), signal);
    }

    it('has no live index before the first commit', async () => {
      expect(await storage.openLive(signal)).toBeUndefined();
      expect(await codeOf(storage.verifyLive({ modelVersion: MODEL }, signal))).toBe(
        'INDEX_UNAVAILABLE',
      );
      expect(await codeOf(openReader(MODEL, signal))).toBe('INDEX_UNAVAILABLE');
    });

    it('refuses an incremental build or a purge with no live index to copy', async () => {
      expect(await codeOf(begin('incremental'))).toBe('INDEX_UNAVAILABLE');
      expect(await codeOf(begin('purge'))).toBe('INDEX_UNAVAILABLE');
    });

    it('keeps a build invisible until it is committed, then serves it', async () => {
      const records = [recordNumber(1), recordNumber(2)];
      const build = await begin('full');
      expect(build).toMatchObject({ kind: 'full', resumed: false });
      await build.store.writer.upsert(records, signal);
      expect(await storage.openLive(signal)).toBeUndefined();

      const verify = await build.verify({ modelVersion: MODEL }, signal);
      expect(verify).toMatchObject({ ok: true, articleCount: 2, chunkCount: 2 });
      await build.commit(metaFor('v1', records), signal);

      const live = await storage.openLive(signal);
      expect(live?.articleCount).toBe(2);
      expect(await live?.dois(signal)).toEqual([doiOf(1), doiOf(2)]);
      expect(await live?.store?.reader.indexMeta(signal)).toEqual(metaFor('v1', records));
      expect(await live?.store?.findRecord(doiOf(2), signal)).toEqual(records[1]);
      await live?.close();
      expect(await storage.verifyLive({ modelVersion: MODEL }, signal)).toMatchObject({
        ok: true,
        articleCount: 2,
      });
    });

    it('fails verification of a build made with another model', async () => {
      const build = await begin('full');
      await build.store.writer.upsert([recordNumber(1)], signal);
      const verify = await build.verify({ modelVersion: 'bge-m3@1' }, signal);
      expect(verify.ok).toBe(false);
      await build.discard(signal);
    });

    it('starts an incremental build from a copy of the live index', async () => {
      await commitFull('v1', [recordNumber(1)]);
      const build = await begin('incremental');
      expect(await build.store.writer.contentHashOf(doiOf(1), signal)).toBeDefined();
      await build.store.writer.upsert([recordNumber(2)], signal);

      const live = await storage.openLive(signal);
      expect(
        await live?.store?.reader.findByDoi(doiOf(2), signal),
        'live index unchanged',
      ).toBeUndefined();
      await live?.close();
      await build.commit(metaFor('v2', [recordNumber(1), recordNumber(2)]), signal);
      expect((await storage.openLive(signal))?.articleCount).toBe(2);
    });

    it('purges full text in a copy, leaving the live index whole until commit', async () => {
      await commitFull('v1', [recordNumber(1, { fullText: true }), recordNumber(2)]);
      const build = await begin('purge');
      expect(await build.store.purgeFullText(LICENSE, signal)).toEqual({ articles: 1, chunks: 1 });
      const live = await storage.openLive(signal);
      expect(await live?.store?.reader.findArticleChunks(doiOf(1), signal)).toHaveLength(2);
      await live?.close();
      await build.commit(metaFor('v2', [recordNumber(1), recordNumber(2)]), signal);
      const after = await storage.openLive(signal);
      expect(await after?.store?.reader.findArticleChunks(doiOf(1), signal)).toHaveLength(1);
      await after?.close();
    });

    it('resumes a closed build of the same kind and drops one of another kind', async () => {
      await commitFull('v1', [recordNumber(1)]);
      const first = await begin('full');
      await first.store.writer.upsert([recordNumber(7)], signal);
      await first.close();

      const again = await begin('full');
      expect(again.resumed).toBe(true);
      expect(await again.store.writer.contentHashOf(doiOf(7), signal)).toBeDefined();
      await again.close();

      const other = await begin('incremental');
      expect(other.resumed).toBe(false);
      expect(await other.store.writer.contentHashOf(doiOf(7), signal)).toBeUndefined();
      await other.close();
    });

    it('starts over after a discarded build', async () => {
      const first = await begin('full');
      await first.store.writer.upsert([recordNumber(1)], signal);
      await first.discard(signal);
      const next = await begin('full');
      expect(next.resumed).toBe(false);
      expect(await next.store.writer.contentHashOf(doiOf(1), signal)).toBeUndefined();
      await next.discard(signal);
    });

    it('lets the reader follow each commit, and only when the version changed', async () => {
      await commitFull('v1', [recordNumber(1)]);
      const reader = await openReader(MODEL, signal);
      try {
        expect(reader.meta().version).toBe('v1');
        expect(await reader.refresh(signal)).toBe(false);

        await commitFull('v2', [recordNumber(1), recordNumber(2)]);
        expect(await reader.reader.findByDoi(doiOf(2), signal)).toBeUndefined();
        expect(await reader.refresh(signal)).toBe(true);
        expect(reader.meta().version).toBe('v2');
        expect(await reader.reader.findByDoi(doiOf(2), signal)).toBeDefined();
        expect(await reader.journals.journals(signal)).toHaveLength(1);
      } finally {
        await reader.close();
      }
    });

    it('refuses an index of another model and keeps serving the current one', async () => {
      await commitFull('v1', [recordNumber(1)], 'bge-m3@1');
      expect(await codeOf(openReader(MODEL, signal))).toBe('INDEX_UNAVAILABLE');

      await commitFull('v2', [recordNumber(1)]);
      const reader = await openReader(MODEL, signal);
      try {
        await commitFull('v3', [recordNumber(1), recordNumber(2)], 'bge-m3@1');
        expect(await codeOf(reader.refresh(signal))).toBe('INDEX_UNAVAILABLE');
        expect(reader.meta().version).toBe('v2');
        expect(await reader.reader.findByDoi(doiOf(1), signal)).toBeDefined();
      } finally {
        await reader.close();
      }
    });
  });
}
