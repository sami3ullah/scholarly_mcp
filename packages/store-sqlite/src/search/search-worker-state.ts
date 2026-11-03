import type { LexicalQuery, RankedChunk, VectorQuery } from '@scholarly-mcp/core';
import type { Db } from '../database/open-database.js';
import { createSqliteSearch } from './create-sqlite-search.js';

/** A message from the pool to a search worker; `id` matches the reply to it. */
export type SearchWorkerRequest =
  | { readonly id: number; readonly kind: 'lexical'; readonly query: LexicalQuery }
  | { readonly id: number; readonly kind: 'vector'; readonly query: VectorQuery }
  | { readonly id: number; readonly kind: 'reopen' };

/** A worker's answer: the hits, or for `reopen` none, or the message of what failed. */
export type SearchWorkerReply =
  | { readonly id: number; readonly ok: true; readonly hits?: RankedChunk[] }
  | { readonly id: number; readonly ok: false; readonly message: string };

/** What one worker does with its own connection, apart from the thread that carries it. */
export interface SearchWorkerState {
  handle(request: SearchWorkerRequest): Promise<SearchWorkerReply>;
  close(): void;
}

/**
 * The search side of one worker (ADR 0041). The index is opened on the first request rather
 * than at start, so a file that cannot be opened is a failed reply, not a crashed worker.
 * `reopen` opens the file again (a newly swapped-in index) and only then closes the old
 * connection, so a failure leaves the worker on the index it had.
 */
export function createSearchWorkerState(open: () => Db): SearchWorkerState {
  let current: { db: Db; search: ReturnType<typeof createSqliteSearch> } | undefined;
  const connect = () => {
    const db = open();
    return { db, search: createSqliteSearch(db) };
  };
  const signal = new AbortController().signal;

  function run(request: SearchWorkerRequest): Promise<RankedChunk[] | undefined> {
    if (request.kind === 'reopen') {
      const next = connect();
      current?.db.close();
      current = next;
      return Promise.resolve(undefined);
    }
    current ??= connect();
    return request.kind === 'lexical'
      ? current.search.lexical(request.query, signal)
      : current.search.vector(request.query, signal);
  }

  return {
    async handle(request) {
      try {
        const hits = await run(request);
        return hits === undefined
          ? { id: request.id, ok: true }
          : { id: request.id, ok: true, hits };
      } catch (error) {
        return {
          id: request.id,
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
    close() {
      current?.db.close();
      current = undefined;
    },
  };
}
