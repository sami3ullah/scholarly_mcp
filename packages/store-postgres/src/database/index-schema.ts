import { appError } from '@scholarly-mcp/core';
import { identifier, type Queryable } from './pool.js';

/**
 * Version of an index schema's layout, kept in its `layout` table. Bump it whenever the
 * tables or the way text is stemmed change: an incremental run then refuses to build on the
 * old schema and a full run is needed (ADR 0034). Index schemas are never migrated.
 */
export const INDEX_LAYOUT_VERSION = 1;

/*
 * One schema per build. Each chunk row carries what both searches need, so neither joins
 * `articles`: the filter columns of its article (its language is the chunk's own, else the
 * article's), the stemmed and folded text written by `packages/lexical`, a weighted `tsv`
 * over them (title A, stemmed text B, folded text C), the folded title and text for the
 * trigram top-up, and the embedding. `sync_state` lives in the build on purpose: a page's
 * articles and the checkpoint after it commit together, as in the SQLite index file.
 */
const tables = (s: string, dimensions: number) => `
CREATE TABLE ${s}.layout (
  id integer PRIMARY KEY CHECK (id = 1),
  version integer NOT NULL,
  dimensions integer NOT NULL
);

CREATE TABLE ${s}.articles (
  doi text COLLATE "C" PRIMARY KEY,
  record jsonb NOT NULL,
  content_hash text NOT NULL,
  language text,
  year integer NOT NULL,
  issn_print text,
  issn_electronic text,
  is_open_access boolean NOT NULL,
  is_retracted boolean NOT NULL
);

CREATE TABLE ${s}.chunks (
  id text COLLATE "C" PRIMARY KEY,
  doi text COLLATE "C" NOT NULL REFERENCES ${s}.articles (doi) ON DELETE CASCADE,
  ordinal integer NOT NULL,
  section text,
  text text NOT NULL,
  language text,
  token_count integer NOT NULL,
  origin text NOT NULL,
  source text NOT NULL,
  license_url text,
  model_version text NOT NULL,
  embedding vector(${String(dimensions)}) NOT NULL,
  search_language text,
  year integer NOT NULL,
  issn_print text,
  issn_electronic text,
  is_open_access boolean NOT NULL,
  is_retracted boolean NOT NULL,
  text_stemmed text NOT NULL,
  text_folded text NOT NULL,
  title_stemmed text NOT NULL,
  title_text_folded text NOT NULL,
  tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', title_stemmed), 'A') ||
    setweight(to_tsvector('simple', text_stemmed), 'B') ||
    setweight(to_tsvector('simple', text_folded), 'C')
  ) STORED
);

CREATE TABLE ${s}.index_meta (
  id integer PRIMARY KEY CHECK (id = 1),
  version text NOT NULL,
  model_version text NOT NULL,
  article_count integer NOT NULL,
  chunk_count integer NOT NULL,
  built_at timestamptz NOT NULL
);

CREATE TABLE ${s}.sync_state (
  source text PRIMARY KEY,
  record jsonb NOT NULL
);

INSERT INTO ${s}.layout (id, version, dimensions)
VALUES (1, ${String(INDEX_LAYOUT_VERSION)}, ${String(dimensions)});
`;

/** Built after a copy rather than before, since filling indexed tables is much slower. */
const indexes = (s: string) => `
CREATE INDEX chunks_by_doi ON ${s}.chunks (doi, ordinal);
CREATE INDEX chunks_tsv ON ${s}.chunks USING gin (tsv);
CREATE INDEX chunks_trigram ON ${s}.chunks USING gin (title_text_folded gin_trgm_ops);
CREATE INDEX chunks_embedding ON ${s}.chunks USING hnsw (embedding vector_cosine_ops);
`;

/** The indexes every committed build has, by name, for verify. */
export const INDEX_NAMES = ['chunks_by_doi', 'chunks_tsv', 'chunks_trigram', 'chunks_embedding'];

/** Chunk columns a copy moves; `tsv` is generated again from them. */
const CHUNK_COPY_COLUMNS = `id, doi, ordinal, section, text, language, token_count, origin,
  source, license_url, model_version, embedding, search_language, year, issn_print,
  issn_electronic, is_open_access, is_retracted, text_stemmed, text_folded, title_stemmed,
  title_text_folded`;

/** The layout of an index schema, or undefined when it has none (not an index, or too old). */
export interface IndexLayout {
  readonly version: number;
  readonly dimensions: number;
}

/**
 * Creates an index schema for vectors of `dimensions` floats, with its indexes, or copies
 * the rows of `from` into it first. Runs inside the caller's transaction.
 */
export async function createIndexSchema(
  db: Queryable,
  schema: string,
  options: { readonly dimensions: number; readonly copyFrom?: string },
): Promise<void> {
  const { dimensions, copyFrom } = options;
  if (!Number.isInteger(dimensions) || dimensions < 1 || dimensions > 16_000) {
    throw new RangeError(`Invalid embedding dimensions ${String(dimensions)}`);
  }
  const s = identifier(schema);
  await db.query(`CREATE SCHEMA ${s}`);
  await db.query(tables(s, dimensions));
  if (copyFrom !== undefined) {
    const from = identifier(copyFrom);
    await db.query(`
      INSERT INTO ${s}.articles SELECT * FROM ${from}.articles;
      INSERT INTO ${s}.chunks (${CHUNK_COPY_COLUMNS})
        SELECT ${CHUNK_COPY_COLUMNS} FROM ${from}.chunks;
      INSERT INTO ${s}.index_meta SELECT * FROM ${from}.index_meta;
      INSERT INTO ${s}.sync_state SELECT * FROM ${from}.sync_state;`);
  }
  await db.query(indexes(s));
}

/** Reads a schema's layout; undefined when the schema or its layout table is missing. */
export async function indexLayoutOf(
  db: Queryable,
  schema: string,
): Promise<IndexLayout | undefined> {
  const found = await db.query<{ found: boolean }>('SELECT to_regclass($1) IS NOT NULL AS found', [
    `${identifier(schema)}.layout`,
  ]);
  if (found.rows[0]?.found !== true) return undefined;
  const { rows } = await db.query<IndexLayout>(
    `SELECT version, dimensions FROM ${identifier(schema)}.layout WHERE id = 1`,
  );
  return rows[0];
}

/** Throws `INDEX_UNAVAILABLE` unless `schema` is an index of this layout and vector size. */
export async function assertIndexLayout(
  db: Queryable,
  schema: string,
  dimensions: number,
): Promise<void> {
  const layout = await indexLayoutOf(db, schema);
  if (layout?.version !== INDEX_LAYOUT_VERSION) {
    throw appError('INDEX_UNAVAILABLE', 'The index has an older layout; run a full build');
  }
  if (layout.dimensions !== dimensions) {
    throw appError(
      'INDEX_UNAVAILABLE',
      'The index holds vectors of another size; run a full build with this model',
    );
  }
}
