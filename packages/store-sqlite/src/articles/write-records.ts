import {
  appError,
  type Article,
  type ArticleRecord,
  type Chunk,
  type Doi,
  foldText,
  type PurgeCounts,
  toJsonWithDates,
} from '@scholarly-mcp/core';
import type { Db } from '../database/open-database.js';
import { stemmedText } from '@scholarly-mcp/lexical';
import { vectorBlob } from './rows.js';

/** Writes and removes article records. Callers run each call inside one transaction. */
export interface RecordWriter {
  /** Replaces an article and all of its chunks. */
  put(record: ArticleRecord): void;
  /** Removes an article and its chunks, if present. */
  remove(doi: Doi): void;
  /** Throws, before anything is written, when records would mix embedding models. */
  check(records: readonly ArticleRecord[]): void;
  /**
   * Removes every full-text chunk under `licenseUrl` and the full-text reference of the
   * articles they belonged to (ADR 0003 guardrail 3). Article content hashes are left as
   * they were, so the next ingest run re-indexes those articles from what it fetches.
   */
  purgeFullText(licenseUrl: string): PurgeCounts;
}

/** Prepares the statements that keep `chunks`, both FTS tables and `vec_chunks` in step. */
export function createRecordWriter(db: Db): RecordWriter {
  const putArticle = db.prepare(
    `INSERT OR REPLACE INTO articles (doi, record, content_hash, language, year, issn_print,
       issn_electronic, is_open_access, is_retracted)
     VALUES (@doi, @record, @contentHash, @language, @year, @issnPrint, @issnElectronic,
       @isOpenAccess, @isRetracted)`,
  );
  const chunkRowids = db.prepare<[string], { rowid: number }>(
    'SELECT rowid FROM chunks WHERE doi = ?',
  );
  const deleteArticle = db.prepare('DELETE FROM articles WHERE doi = ?');
  const deleteChunk = db.prepare('DELETE FROM chunks WHERE rowid = ?');
  const deleteFts = db.prepare('DELETE FROM chunks_fts WHERE rowid = ?');
  const deleteTrigram = db.prepare('DELETE FROM chunks_trigram WHERE rowid = ?');
  const deleteVector = db.prepare('DELETE FROM vec_chunks WHERE rowid = ?');
  const putChunk = db.prepare<Record<string, unknown>, { rowid: number }>(
    `INSERT INTO chunks (id, doi, ordinal, section, text, language, token_count, origin, source,
       license_url, model_version)
     VALUES (@id, @doi, @ordinal, @section, @text, @language, @tokenCount, @origin, @source,
       @licenseUrl, @modelVersion)
     RETURNING rowid`,
  );
  const putFts = db.prepare(
    `INSERT INTO chunks_fts (rowid, text_stemmed, text_folded, title_stemmed)
     VALUES (?, ?, ?, ?)`,
  );
  const putTrigram = db.prepare('INSERT INTO chunks_trigram (rowid, text) VALUES (?, ?)');
  const putVector = db.prepare(
    `INSERT INTO vec_chunks (rowid, embedding, language, year, issn_print, issn_electronic,
       is_open_access, is_retracted)
     VALUES (@rowid, @embedding, @language, @year, @issnPrint, @issnElectronic, @isOpenAccess,
       @isRetracted)`,
  );
  const fullTextChunks = db.prepare<[string], { rowid: number; doi: string }>(
    "SELECT rowid, doi FROM chunks WHERE origin = 'fulltext' AND license_url = ?",
  );
  const dropFullTextRef = db.prepare(
    "UPDATE articles SET record = json_remove(record, '$.fullText') WHERE doi = ?",
  );
  const storedModel = db.prepare<[], { model_version: string }>(
    'SELECT model_version FROM chunks LIMIT 1',
  );

  function removeChunk(rowid: number): void {
    deleteFts.run(rowid);
    deleteTrigram.run(rowid);
    deleteVector.run(rowid);
    deleteChunk.run(rowid);
  }

  function removeChunks(doi: string): void {
    for (const { rowid } of chunkRowids.all(doi)) removeChunk(rowid);
  }

  function putChunkRows(chunk: Chunk, article: Article, filters: ArticleFilterColumns): void {
    const title = article.title;
    const articleLanguage = article.language;
    const language = chunk.language ?? articleLanguage;
    const { rowid } = putChunk.get({
      id: chunk.id,
      doi: chunk.doi,
      ordinal: chunk.ordinal,
      section: chunk.section ?? null,
      text: chunk.text,
      language: chunk.language ?? null,
      tokenCount: chunk.tokenCount,
      origin: chunk.origin,
      source: chunk.source,
      licenseUrl: chunk.licenseUrl ?? null,
      modelVersion: chunk.modelVersion,
    }) as { rowid: number };
    putFts.run(
      rowid,
      stemmedText(chunk.text, language),
      foldText(chunk.text),
      stemmedText(title, articleLanguage),
    );
    putTrigram.run(rowid, foldText(`${title} ${chunk.text}`));
    putVector.run({
      ...filters,
      rowid,
      embedding: vectorBlob(chunk.embedding),
      language: language ?? null,
    });
  }

  return {
    put({ article, chunks }) {
      removeChunks(article.doi);
      const filters = filterColumns(article);
      putArticle.run({
        ...filters,
        doi: article.doi,
        record: toJsonWithDates(article),
        contentHash: article.contentHash,
        language: article.language ?? null,
      });
      for (const chunk of chunks) putChunkRows(chunk, article, filters);
    },
    remove(doi) {
      removeChunks(doi);
      deleteArticle.run(doi);
    },
    purgeFullText(licenseUrl) {
      const chunks = fullTextChunks.all(licenseUrl);
      const dois = new Set(chunks.map(({ doi }) => doi));
      for (const { rowid } of chunks) removeChunk(rowid);
      for (const doi of dois) dropFullTextRef.run(doi);
      return { articles: dois.size, chunks: chunks.length };
    },
    check(records) {
      const expected = storedModel.get()?.model_version ?? records[0]?.chunks[0]?.modelVersion;
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
    },
  };
}

/** The article columns search filters on, kept on `articles` and on every vector row. */
interface ArticleFilterColumns {
  readonly year: number;
  readonly issnPrint: string | null;
  readonly issnElectronic: string | null;
  readonly isOpenAccess: 0 | 1;
  readonly isRetracted: 0 | 1;
}

function filterColumns(article: Article): ArticleFilterColumns {
  return {
    year: article.published.year,
    issnPrint: article.journal.issnPrint ?? null,
    issnElectronic: article.journal.issnElectronic ?? null,
    isOpenAccess: article.isOpenAccess ? 1 : 0,
    isRetracted: article.isRetracted ? 1 : 0,
  };
}
