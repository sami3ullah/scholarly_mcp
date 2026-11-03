import { indexMetaSchema, type IndexMeta } from '@scholarly-mcp/core';
import type { Queryable } from './pool.js';

interface MetaRow {
  readonly version: string;
  readonly model_version: string;
  readonly article_count: number;
  readonly chunk_count: number;
  readonly built_at: Date;
}

/** Reads the description of the index schema `s` (quoted), or undefined before commit. */
export async function readIndexMeta(db: Queryable, s: string): Promise<IndexMeta | undefined> {
  const { rows } = await db.query<MetaRow>(`SELECT * FROM ${s}.index_meta WHERE id = 1`);
  const row = rows[0];
  if (row === undefined) return undefined;
  return indexMetaSchema.parse({
    version: row.version,
    modelVersion: row.model_version,
    articleCount: row.article_count,
    chunkCount: row.chunk_count,
    builtAt: row.built_at,
  });
}

/** Writes the description of the index schema `s` (quoted); there is only ever one. */
export async function writeIndexMeta(db: Queryable, s: string, meta: IndexMeta): Promise<void> {
  await db.query(
    `INSERT INTO ${s}.index_meta (id, version, model_version, article_count, chunk_count,
       built_at) VALUES (1, $1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET version = excluded.version,
       model_version = excluded.model_version, article_count = excluded.article_count,
       chunk_count = excluded.chunk_count, built_at = excluded.built_at`,
    [meta.version, meta.modelVersion, meta.articleCount, meta.chunkCount, meta.builtAt],
  );
}
