import type { ArticleSearch, Doi, RankedChunk } from '@scholarly-mcp/core';
import { hasStemAtWordEdge, trigramStems } from '@scholarly-mcp/lexical';
import { vectorText } from '../articles/rows.js';
import { inTransaction, query, type Pool } from '../database/pool.js';
import { containsPatterns, tsQueryText } from '../text/ts-query.js';
import { filterSql } from './filter-sql.js';

interface HitRow {
  readonly id: string;
  readonly doi: string;
}

interface TrigramRow extends HitRow {
  readonly title_text_folded: string;
}

/*
 * `ts_rank` weights in {D, C, B, A} order, in SQLite's BM25 column ratio of title 2.0,
 * stemmed text 1.0, folded text 0.5 (ADR 0034), halved because `ts_rank` takes weights up to
 * 1. Normalisation 1 divides by 1 + log(length), damping long chunks as BM25 does. Starting
 * values; the golden set tunes them.
 */
const TS_RANK = `ts_rank('{0.05, 0.25, 0.5, 1.0}', c.tsv, q, 1)`;

/*
 * HNSW settings per vector query (ADR 0034). `strict_order` keeps scanning the graph until
 * enough rows pass the filters, in exact distance order; `max_scan_tuples` is raised so a
 * strict filter on the 90k-chunk corpus still fills its list.
 */
const EF_SEARCH = 200;
const MAX_EF_SEARCH = 1000;
const MAX_SCAN_TUPLES = 1_000_000;

const ranked = (rows: readonly HitRow[]): RankedChunk[] =>
  rows.map((row, index) => ({ chunkId: row.id, doi: row.doi as Doi, rank: index + 1 }));

/**
 * Lexical search over the weighted `tsv`, topped up from the trigram index on the folded
 * title and text (substrings, for German compounds) when it finds fewer than the limit; a
 * trigram hit counts only where a word starts or ends with the stem, as in SQLite. Vector
 * search walks the HNSW index on cosine distance with the filters applied during the scan.
 */
export function createPostgresSearch(pool: Pool, s: string): ArticleSearch {
  return {
    lexical: async ({ terms, language, filters, limit }, signal) => {
      signal.throwIfAborted();
      const text = tsQueryText(terms, language);
      if (text === undefined || limit <= 0) return [];
      const where = filterSql(filters, 3);
      const { rows: hits } = await query<HitRow>(
        pool,
        signal,
        `SELECT c.id, c.doi FROM ${s}.chunks c, to_tsquery('simple', $1) q
         WHERE c.tsv @@ q AND ${where.sql}
         ORDER BY ${TS_RANK} DESC, c.id LIMIT $2`,
        [text, limit, ...where.params],
      );
      const stems = trigramStems(terms, language);
      if (hits.length < limit && stems.length > 0) {
        const seen = new Set(hits.map((hit) => hit.id));
        const extra = (await trigramRows(stems, filters, limit, signal)).filter(
          (hit) => !seen.has(hit.id) && hasStemAtWordEdge(hit.title_text_folded, stems),
        );
        hits.push(...extra.slice(0, limit - hits.length));
      }
      return ranked(hits);
    },
    vector: async ({ embedding, filters, limit }, signal) => {
      signal.throwIfAborted();
      if (limit <= 0) return [];
      const where = filterSql(filters, 3);
      const rows = await inTransaction(pool, signal, async (client) => {
        await client.query(
          `SELECT set_config('hnsw.iterative_scan', 'strict_order', true),
             set_config('hnsw.ef_search', $1, true),
             set_config('hnsw.max_scan_tuples', $2, true)`,
          [String(Math.min(MAX_EF_SEARCH, Math.max(EF_SEARCH, limit))), String(MAX_SCAN_TUPLES)],
        );
        const result = await client.query<HitRow>(
          `SELECT id, doi FROM (
             SELECT c.id, c.doi, c.embedding <=> $1::vector AS distance FROM ${s}.chunks c
             WHERE ${where.sql} AND c.embedding <=> $1::vector < 1
             ORDER BY c.embedding <=> $1::vector LIMIT $2
           ) v
           ORDER BY distance, id`,
          [vectorText(embedding), limit, ...where.params],
        );
        return result.rows;
      });
      return ranked(rows);
    },
  };

  async function trigramRows(
    stems: readonly string[],
    filters: Parameters<typeof filterSql>[0],
    limit: number,
    signal: AbortSignal,
  ): Promise<TrigramRow[]> {
    const where = filterSql(filters, 3);
    const { rows } = await query<TrigramRow>(
      pool,
      signal,
      `SELECT c.id, c.doi, c.title_text_folded FROM ${s}.chunks c
       WHERE c.title_text_folded LIKE ANY($1::text[]) AND ${where.sql}
       ORDER BY (SELECT count(*) FROM unnest($1::text[]) p
                 WHERE c.title_text_folded LIKE p) DESC, c.id
       LIMIT $2`,
      [containsPatterns(stems), limit, ...where.params],
    );
    return rows;
  }
}
