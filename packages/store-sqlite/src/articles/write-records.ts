import { appError, type ArticleRecord, type Chunk, type Doi } from '@scholarly-mcp/core';
import { toJsonWithDates } from '../database/json-with-dates.js';
import type { Db } from '../database/open-database.js';
import { foldText } from '../text/fold-text.js';
import { stemmedText } from '../text/terms.js';
import { vectorBlob } from './rows.js';

/** Writes and removes article records. Callers run each call inside one transaction. */
export interface RecordWriter {
  /** Replaces an article and all of its chunks. */
  put(record: ArticleRecord): void;
  /** Removes an article and its chunks, if present. */
  remove(doi: Doi): void;
  /** Throws, before anything is written, when records would mix embedding models. */
  check(records: readonly ArticleRecord[]): void;
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
  const putVector = db.prepare('INSERT INTO vec_chunks (rowid, embedding) VALUES (?, ?)');
  const storedModel = db.prepare<[], { model_version: string }>(
    'SELECT model_version FROM chunks LIMIT 1',
  );

  function removeChunks(doi: string): void {
    for (const { rowid } of chunkRowids.all(doi)) {
      deleteFts.run(rowid);
      deleteTrigram.run(rowid);
      deleteVector.run(BigInt(rowid));
      deleteChunk.run(rowid);
    }
  }

  function putChunkRows(chunk: Chunk, title: string, articleLanguage: string | undefined): void {
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
    putVector.run(BigInt(rowid), vectorBlob(chunk.embedding));
  }

  return {
    put({ article, chunks }) {
      removeChunks(article.doi);
      putArticle.run({
        doi: article.doi,
        record: toJsonWithDates(article),
        contentHash: article.contentHash,
        language: article.language ?? null,
        year: article.published.year,
        issnPrint: article.journal.issnPrint ?? null,
        issnElectronic: article.journal.issnElectronic ?? null,
        isOpenAccess: article.isOpenAccess ? 1 : 0,
        isRetracted: article.isRetracted ? 1 : 0,
      });
      for (const chunk of chunks) putChunkRows(chunk, article.title, article.language);
    },
    remove(doi) {
      removeChunks(doi);
      deleteArticle.run(doi);
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
