import type { Doi } from '@scholarly-mcp/core';
import { createSqliteIndexStore } from '../create-sqlite-index-store.js';
import type { Db } from '../database/open-database.js';

/** One named check of a verify run, with what it found. */
export interface VerifyCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly detail: string;
}

/** What `ingest verify` prints; an index is swapped in only when `ok` is true. */
export interface VerifyReport {
  readonly ok: boolean;
  readonly articleCount: number;
  readonly chunkCount: number;
  readonly checks: readonly VerifyCheck[];
}

export interface VerifyOptions {
  /** The embedder's model version; every chunk must have it. */
  readonly modelVersion: string;
  /** Fails the check when fewer articles are indexed, e.g. 90% of the live index. */
  readonly minArticleCount?: number;
  /** How many articles the sample queries look for. */
  readonly samples?: number;
}

/** How deep in the results a sampled article must appear for the sample queries to pass. */
const SAMPLE_DEPTH = 10;
const DEFAULT_SAMPLES = 5;

/**
 * Checks an index before it is swapped in (PLAN.md "Crash halfway through a run"): file and
 * FTS integrity, counts that agree across tables, one model version, no unexpected shrink,
 * and sample queries that find articles by their own title words and chunks by their own
 * vector.
 */
export async function verifyIndex(
  db: Db,
  options: VerifyOptions,
  signal: AbortSignal,
): Promise<VerifyReport> {
  const count = (sql: string) => Number(db.prepare(sql).pluck().get());
  const articleCount = count('SELECT count(*) FROM articles');
  const chunkCount = count('SELECT count(*) FROM chunks');
  const models = db.prepare('SELECT DISTINCT model_version FROM chunks').pluck().all();
  const checks: VerifyCheck[] = [
    check('sqlite integrity', () => String(db.pragma('quick_check', { simple: true })) === 'ok'),
    check('fts integrity', () => {
      for (const table of ['chunks_fts', 'chunks_trigram']) {
        db.prepare(`INSERT INTO ${table} (${table}, rank) VALUES ('integrity-check', 1)`).run();
      }
      return true;
    }),
    result('not empty', articleCount > 0, `${String(articleCount)} articles`),
    result(
      'every article has chunks',
      count(
        'SELECT count(*) FROM articles a WHERE NOT EXISTS (SELECT 1 FROM chunks c WHERE c.doi = a.doi)',
      ) === 0,
      'articles without chunks would be unfindable',
    ),
    result(
      'vector per chunk',
      count('SELECT count(*) FROM vec_chunks') === chunkCount,
      `${String(chunkCount)} chunks`,
    ),
    result(
      'one model version',
      models.length === 0 || (models.length === 1 && models[0] === options.modelVersion),
      `found ${models.map(String).join(', ') || 'none'}, expected ${options.modelVersion}`,
    ),
    result(
      'no unexpected shrink',
      articleCount >= (options.minArticleCount ?? 0),
      `${String(articleCount)} articles, at least ${String(options.minArticleCount ?? 0)} expected`,
    ),
    ...(await sampleQueries(db, options.samples ?? DEFAULT_SAMPLES, signal)),
  ];
  return { ok: checks.every((item) => item.ok), articleCount, chunkCount, checks };
}

async function sampleQueries(db: Db, samples: number, signal: AbortSignal): Promise<VerifyCheck[]> {
  const store = createSqliteIndexStore(db);
  const dois = db
    .prepare<[number, number], Doi>(
      `SELECT doi FROM (SELECT doi, row_number() OVER (ORDER BY doi) AS n,
         count(*) OVER () AS total FROM articles)
       WHERE (n - 1) % max(1, total / ?) = 0 LIMIT ?`,
    )
    .pluck()
    .all(samples, samples);
  const filters = { includeRetracted: true };
  const checks: VerifyCheck[] = [];
  for (const doi of dois) {
    const record = await store.findRecord(doi, signal);
    const chunk = record?.chunks[0];
    if (record === undefined || chunk === undefined) continue;
    const terms = record.article.title.split(/\s+/);
    const lexical = await store.search.lexical({ terms, filters, limit: SAMPLE_DEPTH }, signal);
    const vector = await store.search.vector(
      { embedding: chunk.embedding, filters, limit: SAMPLE_DEPTH },
      signal,
    );
    checks.push(
      result(
        `title finds ${doi}`,
        lexical.some((hit) => hit.doi === doi),
        'lexical sample',
      ),
      result(
        `vector finds ${chunk.id}`,
        vector.some((hit) => hit.chunkId === chunk.id),
        'vector sample',
      ),
    );
  }
  return checks;
}

function result(name: string, ok: boolean, detail: string): VerifyCheck {
  return { name, ok, detail };
}

function check(name: string, test: () => boolean): VerifyCheck {
  try {
    const ok = test();
    return result(name, ok, ok ? 'ok' : 'failed');
  } catch (error) {
    return result(name, false, error instanceof Error ? error.message : String(error));
  }
}
