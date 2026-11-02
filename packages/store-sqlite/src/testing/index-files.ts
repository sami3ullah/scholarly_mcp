import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ArticleRecord, IndexMeta } from '@scholarly-mcp/core';
import { aChunk, anArticle } from '@scholarly-mcp/testkit';

export const MODEL = 'multilingual-e5-small@test';

/** A fresh temporary directory with an index path inside it, and a cleanup function. */
export function tempIndexPath(): { indexPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'store-sqlite-'));
  return {
    indexPath: join(dir, 'index.sqlite'),
    cleanup: () => {
      rmSync(dir, { recursive: true });
    },
  };
}

/** A record with a distinct title and embedding per number. */
export function recordNumber(n: number): ArticleRecord {
  const doi = `10.1055/a-${String(n)}`;
  return {
    article: anArticle()
      .withDoi(doi)
      .withTitle(`Study ${String(n)} of anticoagulation`)
      .build(),
    chunks: [aChunk().of(doi).withEmbedding(1, n).build()],
  };
}

export function metaFor(version: string, articleCount: number): IndexMeta {
  return {
    version,
    modelVersion: MODEL,
    articleCount,
    chunkCount: articleCount,
    builtAt: new Date('2026-11-02T10:00:00Z'),
  };
}
