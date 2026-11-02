import type { ArticleSearch, Doi, RankedChunk, SearchFilters } from '@scholarly-mcp/core';
import { vectorBlob } from '../articles/rows.js';
import type { Db } from '../database/open-database.js';
import { mainMatch, trigramMatch } from '../text/fts-match.js';
import { withSignal } from '../with-signal.js';
import { filterSql } from './filter-sql.js';

interface HitRow {
  readonly id: string;
  readonly doi: string;
}

/*
 * BM25 column weights for text_stemmed, text_folded and title_stemmed: an exact word scores
 * on top of its stem, and the title, repeated in every chunk's row, counts double.
 * Starting values; SM-08 tunes them against the golden set.
 */
const BM25 = 'bm25(chunks_fts, 1.0, 0.5, 2.0)';

const ranked = (rows: readonly HitRow[]): RankedChunk[] =>
  rows.map((row, index) => ({ chunkId: row.id, doi: row.doi as Doi, rank: index + 1 }));

/**
 * Lexical search over the stemmed and folded FTS table, topped up from the trigram table
 * (substrings, for German compounds) when it finds fewer than the limit. Vector search is an
 * exact cosine scan over every chunk that passes the filters, so filters never cut results
 * short; at the plan's corpus size (about 50k chunks) that is fast enough.
 */
export function createSqliteSearch(db: Db): ArticleSearch {
  const lexicalRows = (
    table: string,
    order: string,
    match: string,
    filters: SearchFilters,
    limit: number,
  ) => {
    const where = filterSql(filters);
    return db
      .prepare<unknown[], HitRow>(
        `SELECT c.id, c.doi FROM ${table} f
         JOIN chunks c ON c.rowid = f.rowid JOIN articles a ON a.doi = c.doi
         WHERE ${table} MATCH ? AND ${where.sql}
         ORDER BY ${order}, c.id LIMIT ?`,
      )
      .all(match, ...where.params, limit);
  };

  return {
    lexical: ({ terms, filters, limit }, signal) =>
      withSignal(signal, () => {
        const main = mainMatch(terms);
        if (main === undefined || limit <= 0) return [];
        const hits = lexicalRows('chunks_fts', BM25, main, filters, limit);
        const trigram = trigramMatch(terms);
        if (hits.length < limit && trigram !== undefined) {
          const seen = new Set(hits.map((hit) => hit.id));
          const extra = lexicalRows(
            'chunks_trigram',
            'bm25(chunks_trigram)',
            trigram,
            filters,
            limit,
          );
          hits.push(...extra.filter((hit) => !seen.has(hit.id)).slice(0, limit - hits.length));
        }
        return ranked(hits);
      }),
    vector: ({ embedding, filters, limit }, signal) =>
      withSignal(signal, () => {
        const where = filterSql(filters);
        const rows = db
          .prepare<unknown[], HitRow>(
            `SELECT c.id, c.doi FROM (
               SELECT rowid, vec_distance_cosine(embedding, ?) AS distance FROM vec_chunks
             ) v
             JOIN chunks c ON c.rowid = v.rowid JOIN articles a ON a.doi = c.doi
             WHERE v.distance < 1 AND ${where.sql}
             ORDER BY v.distance, c.id LIMIT ?`,
          )
          .all(vectorBlob(embedding), ...where.params, limit);
        return ranked(rows);
      }),
  };
}
