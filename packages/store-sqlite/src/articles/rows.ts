import {
  articleSchema,
  chunkSchema,
  fromJsonWithDates,
  type Article,
  type Chunk,
} from '@scholarly-mcp/core';

/** A `chunks` row joined with its vector. */
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
  readonly embedding: Buffer;
}

/** Columns selected for a {@link ChunkRow}; the query must join `vec_chunks v` to `chunks c`. */
export const CHUNK_COLUMNS = `c.id, c.doi, c.ordinal, c.section, c.text, c.language,
  c.token_count, c.origin, c.source, c.license_url, c.model_version, v.embedding`;

/** Reads a stored article back, validated, since the file is an edge of the app. */
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
    embedding: vectorFromBlob(row.embedding),
    ...(row.section !== null && { section: row.section }),
    ...(row.language !== null && { language: row.language }),
    ...(row.license_url !== null && { licenseUrl: row.license_url }),
  });
}

/** The blob sqlite-vec stores for a vector: its float32 bytes. */
export function vectorBlob(vector: Float32Array): Buffer {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}

function vectorFromBlob(blob: Buffer): Float32Array {
  const copy = new Uint8Array(blob);
  return new Float32Array(copy.buffer, 0, copy.byteLength / Float32Array.BYTES_PER_ELEMENT);
}
