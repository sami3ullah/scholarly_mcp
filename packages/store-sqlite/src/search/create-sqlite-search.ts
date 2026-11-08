import type { ArticleSearch, Doi, RankedChunk, SearchFilters } from '@scholarly-mcp/core';
import { vectorBlob } from '../articles/rows.js';
import type { Db } from '../database/open-database.js';
import { hasStemAtWordEdge, trigramStems } from '@scholarly-mcp/lexical';
import { mainMatch, trigramMatch } from '../text/fts-match.js';
import { withSignal } from '../with-signal.js';
import { filterSql } from './filter-sql.js';

interface HitRow {
  readonly id: string;
  readonly doi: string;
}

interface VectorRow extends HitRow {
  readonly distance: number;
}

interface TrigramRow extends HitRow {
  readonly title: string;
  readonly text: string;
}

/*
 * BM25 column weights for text_stemmed, text_folded and title_stemmed: an exact word scores
 * on top of its stem, and the title, repeated in every chunk's row, counts double.
 * The golden set kept these values (ADR 0026).
 */
const BM25 = 'bm25(chunks_fts, 1.0, 0.5, 2.0)';

/**
 * The Euclidean distance between unit vectors at cosine 0 is √2. Just under it, so float32
 * rounding cannot let a chunk at cosine 0 through. Applied after the top-k cut: inside the
 * scan, SQLite would compute every distance twice, and the nearest k past the cut-off
 * keep the same rows.
 */
const MAX_VECTOR_DISTANCE = Math.SQRT2 - 1e-6;

const ranked = (rows: readonly HitRow[]): RankedChunk[] =>
  rows.map((row, index) => ({ chunkId: row.id, doi: row.doi as Doi, rank: index + 1 }));

/**
 * Lexical search over the stemmed and folded FTS table, topped up from the trigram table
 * (substrings, for German compounds) when it finds fewer than the limit; a trigram hit counts
 * only where a word starts or ends with the stem, as a compound part does. Vector search is an
 * exact scan over every chunk that passes the filters, so filters never cut results short
 * (ADR 0022). It ranks by Euclidean distance, which sqlite-vec computes with SIMD: for unit
 * vectors that is cosine order, and cosine above 0 is a distance below √2. About 30 ms for
 * the 177k chunks of the full Thieme index, against 170 ms for the scalar cosine (ADR 0040).
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
         JOIN vec_chunks s ON s.rowid = f.rowid JOIN chunks c ON c.rowid = f.rowid
         WHERE ${table} MATCH ? AND ${where.sql}
         ORDER BY ${order}, c.id LIMIT ?`,
      )
      .all(match, ...where.params, limit);
  };

  const trigramRows = (match: string, filters: SearchFilters, limit: number) => {
    const where = filterSql(filters);
    return db
      .prepare<unknown[], TrigramRow>(
        `SELECT c.id, c.doi, c.text, json_extract(a.record, '$.title') AS title
         FROM chunks_trigram f
         JOIN vec_chunks s ON s.rowid = f.rowid JOIN chunks c ON c.rowid = f.rowid
         JOIN articles a ON a.doi = c.doi
         WHERE chunks_trigram MATCH ? AND ${where.sql}
         ORDER BY bm25(chunks_trigram), c.id LIMIT ?`,
      )
      .all(match, ...where.params, limit);
  };

  return {
    lexical: ({ terms, language, filters, limit }, signal) =>
      withSignal(signal, () => {
        const main = mainMatch(terms, language);
        if (main === undefined || limit <= 0) return [];
        const hits = lexicalRows('chunks_fts', BM25, main, filters, limit);
        const stems = trigramStems(terms, language);
        const trigram = trigramMatch(stems);
        if (hits.length < limit && trigram !== undefined) {
          const seen = new Set(hits.map((hit) => hit.id));
          const extra = trigramRows(trigram, filters, limit).filter(
            (hit) => !seen.has(hit.id) && hasStemAtWordEdge(`${hit.title} ${hit.text}`, stems),
          );
          hits.push(...extra.slice(0, limit - hits.length));
        }
        return ranked(hits);
      }),
    vector: ({ embedding, filters, limit }, signal) =>
      withSignal(signal, () => {
        const where = filterSql(filters);
        const rows = db
          .prepare<unknown[], VectorRow>(
            `SELECT c.id, c.doi, v.distance FROM (
               SELECT rowid, vec_distance_l2(embedding, ?) AS distance FROM vec_chunks s
               WHERE ${where.sql}
               ORDER BY distance, rowid LIMIT ?
             ) v
             JOIN chunks c ON c.rowid = v.rowid
             WHERE v.distance < ?
             ORDER BY v.distance, c.id`,
          )
          .all(vectorBlob(embedding), ...where.params, limit, MAX_VECTOR_DISTANCE);
        // For unit vectors, the squared Euclidean distance is 2 - 2 cos.
        return rows.map((row, index) => ({
          chunkId: row.id,
          doi: row.doi as Doi,
          rank: index + 1,
          similarity: 1 - (row.distance * row.distance) / 2,
        }));
      }),
  };
}
