import { indexMetaSchema, type IndexMeta } from '@scholarly-mcp/core';
import type { Db } from './open-database.js';

interface MetaRow {
  readonly version: string;
  readonly model_version: string;
  readonly article_count: number;
  readonly chunk_count: number;
  readonly built_at: string;
}

/** Reads the index description, or undefined when the index was never committed. */
export function readIndexMeta(db: Db): IndexMeta | undefined {
  const row = db.prepare<[], MetaRow>('SELECT * FROM index_meta WHERE id = 1').get();
  if (row === undefined) return undefined;
  return indexMetaSchema.parse({
    version: row.version,
    modelVersion: row.model_version,
    articleCount: row.article_count,
    chunkCount: row.chunk_count,
    builtAt: new Date(row.built_at),
  });
}

/** Writes the index description; there is only ever one. */
export function writeIndexMeta(db: Db, meta: IndexMeta): void {
  db.prepare(
    `INSERT OR REPLACE INTO index_meta (id, version, model_version, article_count, chunk_count,
       built_at) VALUES (1, ?, ?, ?, ?, ?)`,
  ).run(
    meta.version,
    meta.modelVersion,
    meta.articleCount,
    meta.chunkCount,
    meta.builtAt.toISOString(),
  );
}
