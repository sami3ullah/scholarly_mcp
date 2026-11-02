import { doiSchema } from '@scholarly-mcp/core';
import {
  aChunk,
  anArticle,
  runArticleStoreContract,
  runSyncStateStoreContract,
} from '@scholarly-mcp/testkit';
import { describe, expect, it } from 'vitest';
import { createSqliteIndexStore } from './create-sqlite-index-store.js';
import { createIndexSchema } from './database/index-schema.js';
import { openDatabase } from './database/open-database.js';

function freshStore() {
  const db = openDatabase(':memory:');
  createIndexSchema(db);
  return createSqliteIndexStore(db);
}

runArticleStoreContract('SQLite index store', freshStore);
runSyncStateStoreContract('SQLite sync state store', () => freshStore().syncState);

const signal = new AbortController().signal;

describe('purgeFullText', () => {
  const CC_BY = 'https://creativecommons.org/licenses/by/4.0/';
  const CC_BY_NC_ND = 'https://creativecommons.org/licenses/by-nc-nd/4.0/';
  const ref = (licenseUrl: string) => ({
    source: 'europepmc' as const,
    id: 'PMC1',
    licenseUrl,
    revision: '2024-08-01',
  });

  async function seeded() {
    const store = freshStore();
    const record = (doi: string, licenseUrl: string) => ({
      article: { ...anArticle().withDoi(doi).openAccess().build(), fullText: ref(licenseUrl) },
      chunks: [
        aChunk().of(doi, 0).build(),
        aChunk()
          .of(doi, 1)
          .withText('Thrombectomy registry methods')
          .fromFullText(licenseUrl)
          .build(),
      ],
    });
    await store.writer.upsert(
      [record('10.1055/a-1', CC_BY_NC_ND), record('10.1055/a-2', CC_BY)],
      signal,
    );
    return store;
  }

  it('removes the full text under one licence and keeps everything else', async () => {
    const store = await seeded();
    const before = await store.writer.contentHashOf(doiSchema.parse('10.1055/a-1'), signal);

    expect(await store.purgeFullText(CC_BY_NC_ND, signal)).toEqual({ articles: 1, chunks: 1 });

    const purged = await store.findRecord(doiSchema.parse('10.1055/a-1'), signal);
    expect(purged?.chunks.map((chunk) => chunk.origin)).toEqual(['abstract']);
    expect(purged?.article).not.toHaveProperty('fullText');
    // The stale hash makes the next ingest run re-index the article from what it fetches.
    expect(await store.writer.contentHashOf(doiSchema.parse('10.1055/a-1'), signal)).toBe(before);

    const kept = await store.findRecord(doiSchema.parse('10.1055/a-2'), signal);
    expect(kept?.chunks.map((chunk) => chunk.origin)).toEqual(['abstract', 'fulltext']);
    expect(kept?.article.fullText).toEqual(ref(CC_BY));

    const hits = await store.search.lexical(
      { terms: ['thrombectomy'], filters: {}, limit: 10 },
      signal,
    );
    expect(hits.map((hit) => hit.doi)).toEqual(['10.1055/a-2']);
  });

  it('removes nothing for a licence with no full text', async () => {
    const store = await seeded();
    expect(await store.purgeFullText('https://example.org/licence', signal)).toEqual({
      articles: 0,
      chunks: 0,
    });
  });
});
