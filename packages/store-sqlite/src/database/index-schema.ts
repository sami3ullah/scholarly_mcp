import type { Db } from './open-database.js';

/**
 * Version of the index file layout, kept in `PRAGMA user_version`. Bump it whenever the
 * schema or the way text is stemmed changes: an incremental run then refuses to build on
 * the old file and a full run is needed.
 */
export const INDEX_SCHEMA_VERSION = 2;

/*
 * Indexes that speed up reads without changing the layout, so a file of this version
 * without them is still valid: every build commit adds the missing ones (`addIndexes`).
 * `vec_chunks_by_language` lets the German lane of a search read only German rows
 * (ADR 0044).
 */
const INDEXES = `
CREATE INDEX IF NOT EXISTS vec_chunks_by_language ON vec_chunks (language);
`;

/** Adds the read indexes an index file of this version may lack. */
export function addIndexes(db: Db): void {
  db.exec(INDEXES);
}

/*
 * `chunks.rowid` links each chunk to its rows in the two FTS tables and the vector table.
 * The FTS tables are contentless (the text lives in `chunks`), with deletes enabled.
 * `vec_chunks` is a plain table, not a vec0 one: it repeats the filter columns of the
 * chunk's article, so an exact cosine scan with filters reads one narrow table (about 60 ms
 * for 90k chunks, against 1.2 s for a vec0 scan joined to `articles`; ADR 0022). The
 * language is the chunk's own, else the article's.
 * `sync_state` lives in the index file on purpose: a page's articles and the checkpoint
 * after it are built into the same file, so they can never disagree after a crash.
 */
const schema = (dimensions: number) => `
CREATE TABLE articles (
  doi TEXT PRIMARY KEY,
  record TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  language TEXT,
  year INTEGER NOT NULL,
  issn_print TEXT,
  issn_electronic TEXT,
  is_open_access INTEGER NOT NULL,
  is_retracted INTEGER NOT NULL
) STRICT;

CREATE TABLE chunks (
  rowid INTEGER PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  doi TEXT NOT NULL REFERENCES articles (doi),
  ordinal INTEGER NOT NULL,
  section TEXT,
  text TEXT NOT NULL,
  language TEXT,
  token_count INTEGER NOT NULL,
  origin TEXT NOT NULL,
  source TEXT NOT NULL,
  license_url TEXT,
  model_version TEXT NOT NULL
) STRICT;

CREATE INDEX chunks_by_doi ON chunks (doi, ordinal);

CREATE VIRTUAL TABLE chunks_fts USING fts5 (
  text_stemmed, text_folded, title_stemmed,
  content = '', contentless_delete = 1,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE VIRTUAL TABLE chunks_trigram USING fts5 (
  text,
  content = '', contentless_delete = 1,
  tokenize = 'trigram remove_diacritics 1'
);

CREATE TABLE vec_chunks (
  rowid INTEGER PRIMARY KEY,
  embedding BLOB NOT NULL CHECK (length(embedding) = ${String(dimensions * 4)}),
  language TEXT,
  year INTEGER NOT NULL,
  issn_print TEXT,
  issn_electronic TEXT,
  is_open_access INTEGER NOT NULL,
  is_retracted INTEGER NOT NULL
) STRICT;

${INDEXES}

CREATE TABLE index_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  version TEXT NOT NULL,
  model_version TEXT NOT NULL,
  article_count INTEGER NOT NULL,
  chunk_count INTEGER NOT NULL,
  built_at TEXT NOT NULL
) STRICT;

CREATE TABLE sync_state (
  source TEXT PRIMARY KEY,
  record TEXT NOT NULL
) STRICT;

CREATE TABLE index_build (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  kind TEXT NOT NULL,
  started_at TEXT NOT NULL
) STRICT;
`;

/** Creates the index tables in an empty database, for vectors of `dimensions` floats. */
export function createIndexSchema(db: Db, options: { readonly dimensions: number }): void {
  if (!Number.isInteger(options.dimensions) || options.dimensions < 1) {
    throw new RangeError(`Invalid embedding dimensions ${String(options.dimensions)}`);
  }
  db.transaction(() => {
    db.exec(schema(options.dimensions));
    db.pragma(`user_version = ${String(INDEX_SCHEMA_VERSION)}`);
  })();
}

/** The layout version of an index file, 0 for a file without one. */
export function indexSchemaVersion(db: Db): number {
  return Number(db.pragma('user_version', { simple: true }));
}

/**
 * The vector size an index file was created for, read from its `vec_chunks` check, or
 * undefined for a file without the table.
 */
export function embeddingDimensionsOf(db: Db): number | undefined {
  const row = db
    .prepare<[], { sql: string }>("SELECT sql FROM sqlite_master WHERE name = 'vec_chunks'")
    .get();
  const bytes = row && /length\(embedding\) = (\d+)/.exec(row.sql)?.[1];
  return bytes ? Number(bytes) / 4 : undefined;
}
