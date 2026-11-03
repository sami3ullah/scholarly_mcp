import {
  appError,
  foldText,
  toJsonWithDates,
  type ArticleRecord,
  type Doi,
  type PurgeCounts,
} from '@scholarly-mcp/core';
import { stemmedText } from '@scholarly-mcp/lexical';
import type { PoolClient } from '../database/pool.js';
import { vectorText } from './rows.js';

/**
 * Replaces articles and all their chunks, inside the caller's transaction. Each batch is two
 * statements over `unnest`ed arrays, not one per row. Within a batch the last record of a DOI
 * wins, as when they are written one by one.
 */
export async function putRecords(
  client: PoolClient,
  s: string,
  batch: readonly ArticleRecord[],
): Promise<void> {
  await checkRecords(client, s, batch);
  const records = [...new Map(batch.map((record) => [record.article.doi, record])).values()];
  if (records.length === 0) return;
  const articles = records.map(({ article }) => article);
  await client.query(`DELETE FROM ${s}.chunks WHERE doi = ANY($1)`, [
    articles.map(({ doi }) => doi),
  ]);
  await client.query(
    `INSERT INTO ${s}.articles (doi, record, content_hash, language, year, issn_print,
       issn_electronic, is_open_access, is_retracted)
     SELECT * FROM unnest($1::text[], $2::jsonb[], $3::text[], $4::text[], $5::int[],
       $6::text[], $7::text[], $8::boolean[], $9::boolean[])
     ON CONFLICT (doi) DO UPDATE SET record = excluded.record,
       content_hash = excluded.content_hash, language = excluded.language, year = excluded.year,
       issn_print = excluded.issn_print, issn_electronic = excluded.issn_electronic,
       is_open_access = excluded.is_open_access, is_retracted = excluded.is_retracted`,
    [
      articles.map(({ doi }) => doi),
      articles.map((article) => toJsonWithDates(article)),
      articles.map(({ contentHash }) => contentHash),
      articles.map(({ language }) => language ?? null),
      articles.map(({ published }) => published.year),
      articles.map(({ journal }) => journal.issnPrint ?? null),
      articles.map(({ journal }) => journal.issnElectronic ?? null),
      articles.map(({ isOpenAccess }) => isOpenAccess),
      articles.map(({ isRetracted }) => isRetracted),
    ],
  );
  const rows = records.flatMap(({ article, chunks }) =>
    chunks.map((chunk) => ({ article, chunk, language: chunk.language ?? article.language })),
  );
  if (rows.length === 0) return;
  await client.query(
    `INSERT INTO ${s}.chunks (id, doi, ordinal, section, text, language, token_count, origin,
       source, license_url, model_version, embedding, search_language, year, issn_print,
       issn_electronic, is_open_access, is_retracted, text_stemmed, text_folded, title_stemmed,
       title_text_folded)
     SELECT id, doi, ordinal, section, text, language, token_count, origin, source, license_url,
       model_version, embedding::vector, search_language, year, issn_print, issn_electronic,
       is_open_access, is_retracted, text_stemmed, text_folded, title_stemmed, title_text_folded
     FROM unnest($1::text[], $2::text[], $3::int[], $4::text[], $5::text[], $6::text[],
       $7::int[], $8::text[], $9::text[], $10::text[], $11::text[], $12::text[], $13::text[],
       $14::int[], $15::text[], $16::text[], $17::boolean[], $18::boolean[], $19::text[],
       $20::text[], $21::text[], $22::text[])
       AS t (id, doi, ordinal, section, text, language, token_count, origin, source,
         license_url, model_version, embedding, search_language, year, issn_print,
         issn_electronic, is_open_access, is_retracted, text_stemmed, text_folded,
         title_stemmed, title_text_folded)`,
    [
      rows.map(({ chunk }) => chunk.id),
      rows.map(({ chunk }) => chunk.doi),
      rows.map(({ chunk }) => chunk.ordinal),
      rows.map(({ chunk }) => chunk.section ?? null),
      rows.map(({ chunk }) => chunk.text),
      rows.map(({ chunk }) => chunk.language ?? null),
      rows.map(({ chunk }) => chunk.tokenCount),
      rows.map(({ chunk }) => chunk.origin),
      rows.map(({ chunk }) => chunk.source),
      rows.map(({ chunk }) => chunk.licenseUrl ?? null),
      rows.map(({ chunk }) => chunk.modelVersion),
      rows.map(({ chunk }) => vectorText(chunk.embedding)),
      rows.map(({ language }) => language ?? null),
      rows.map(({ article }) => article.published.year),
      rows.map(({ article }) => article.journal.issnPrint ?? null),
      rows.map(({ article }) => article.journal.issnElectronic ?? null),
      rows.map(({ article }) => article.isOpenAccess),
      rows.map(({ article }) => article.isRetracted),
      rows.map(({ chunk, language }) => stemmedText(chunk.text, language)),
      rows.map(({ chunk }) => foldText(chunk.text)),
      rows.map(({ article }) => stemmedText(article.title, article.language)),
      rows.map(({ article, chunk }) => foldText(`${article.title} ${chunk.text}`)),
    ],
  );
}

/** Removes an article and its chunks, if present. */
export async function removeRecord(client: PoolClient, s: string, doi: Doi): Promise<void> {
  await client.query(`DELETE FROM ${s}.articles WHERE doi = $1`, [doi]);
}

/**
 * Removes every full-text chunk under `licenseUrl` and the full-text reference of the
 * articles they belonged to (ADR 0003 guardrail 3), inside the caller's transaction. Content
 * hashes stay as they were, so the next ingest run re-indexes those articles.
 */
export async function purgeFullText(
  client: PoolClient,
  s: string,
  licenseUrl: string,
): Promise<PurgeCounts> {
  const { rows } = await client.query<{ doi: string }>(
    `DELETE FROM ${s}.chunks WHERE origin = 'fulltext' AND license_url = $1 RETURNING doi`,
    [licenseUrl],
  );
  const dois = [...new Set(rows.map(({ doi }) => doi))];
  await client.query(`UPDATE ${s}.articles SET record = record - 'fullText' WHERE doi = ANY($1)`, [
    dois,
  ]);
  return { articles: dois.length, chunks: rows.length };
}

/** Throws, before anything is written, when records would mix embedding models. */
async function checkRecords(
  client: PoolClient,
  s: string,
  records: readonly ArticleRecord[],
): Promise<void> {
  const stored = await client.query<{ model_version: string }>(
    `SELECT model_version FROM ${s}.chunks LIMIT 1`,
  );
  const expected = stored.rows[0]?.model_version ?? records[0]?.chunks[0]?.modelVersion;
  for (const { article, chunks } of records) {
    for (const chunk of chunks) {
      if (chunk.doi !== article.doi) {
        throw appError('INVALID_INPUT', `Chunk ${chunk.id} does not belong to ${article.doi}`);
      }
      if (chunk.modelVersion !== expected) {
        throw appError('INVALID_INPUT', 'Refusing to mix embedding model versions', {
          field: 'modelVersion',
        });
      }
    }
  }
}
