import {
  articleSchema,
  chunkSchema,
  fromJsonWithDates,
  type Article,
  type Chunk,
} from '@scholarly-mcp/core';

/** A `chunks` row as {@link CHUNK_COLUMNS} selects it. */
export interface ChunkRow {
  readonly id: string;
  readonly doi: string;
  readonly ordinal: number;
  readonly section: string | null;
  readonly text: string;
  readonly language: string | null;
  readonly token_count: number;
  readonly origin: string;
  readonly source: string;
  readonly license_url: string | null;
  readonly model_version: string;
  readonly embedding: string;
}

/** Columns selected for a {@link ChunkRow}; the embedding comes back as pgvector text. */
export const CHUNK_COLUMNS = `id, doi, ordinal, section, text, language, token_count, origin,
  source, license_url, model_version, embedding::text AS embedding`;

/** Reads a stored article back from its `record::text`, validated. */
export function articleFromRecord(record: string): Article {
  return articleSchema.parse(fromJsonWithDates(record));
}

/** Rebuilds a chunk from its row, validated. */
export function chunkFromRow(row: ChunkRow): Chunk {
  return chunkSchema.parse({
    id: row.id,
    doi: row.doi,
    ordinal: row.ordinal,
    text: row.text,
    tokenCount: row.token_count,
    origin: row.origin,
    source: row.source,
    modelVersion: row.model_version,
    embedding: vectorFromText(row.embedding),
    ...(row.section !== null && { section: row.section }),
    ...(row.language !== null && { language: row.language }),
    ...(row.license_url !== null && { licenseUrl: row.license_url }),
  });
}

/**
 * The pgvector text form of a vector. Each float32 is written as the shortest decimal that
 * reads back as the same double, so it round-trips exactly.
 */
export function vectorText(vector: Float32Array): string {
  return `[${Array.from(vector).join(',')}]`;
}

function vectorFromText(text: string): Float32Array {
  return Float32Array.from(text.slice(1, -1).split(','), Number);
}
