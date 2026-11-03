import { TEST_EMBEDDING_DIMENSIONS } from '@scholarly-mcp/testkit';
import { describe, expect, it } from 'vitest';
import { createSqliteIndexStore } from '../create-sqlite-index-store.js';
import { createIndexSchema } from '../database/index-schema.js';
import { openDatabase, type Db } from '../database/open-database.js';
import { recordNumber } from '../testing/index-files.js';
import { createSearchWorkerState } from './search-worker-state.js';

const signal = new AbortController().signal;

async function indexOf(...numbers: number[]): Promise<Db> {
  const db = openDatabase(':memory:');
  createIndexSchema(db, { dimensions: TEST_EMBEDDING_DIMENSIONS });
  await createSqliteIndexStore(db).writer.upsert(numbers.map(recordNumber), signal);
  return db;
}

const embedding = recordNumber(1).chunks[0]?.embedding ?? new Float32Array();
const vector = (id: number) =>
  ({ id, kind: 'vector', query: { embedding, filters: {}, limit: 10 } }) as const;
const lexical = (id: number) =>
  ({ id, kind: 'lexical', query: { terms: ['anticoagulation'], filters: {}, limit: 10 } }) as const;

describe('createSearchWorkerState', () => {
  it('answers lexical and vector searches with the hits, matched by id', async () => {
    const db = await indexOf(1, 2);
    const state = createSearchWorkerState(() => db);
    const byVector = await state.handle(vector(7));
    expect(byVector).toMatchObject({
      id: 7,
      ok: true,
      hits: [{ doi: '10.1055/a-1', rank: 1 }, {}],
    });
    expect(await state.handle(lexical(8))).toMatchObject({ id: 8, ok: true, hits: [{}, {}] });
    state.close();
  });

  it('opens the index on the first search, and reports an open that fails as a reply', async () => {
    let opens = 0;
    const state = createSearchWorkerState(() => {
      opens += 1;
      throw new Error('no such file');
    });
    expect(opens).toBe(0);
    expect(await state.handle(vector(1))).toEqual({ id: 1, ok: false, message: 'no such file' });
  });

  it('moves to the reopened index, and stays on the old one when reopening fails', async () => {
    const files = [await indexOf(1), await indexOf(1, 2)];
    let fail = false;
    const state = createSearchWorkerState(() => {
      if (fail) throw new Error('unusable');
      const db = files.shift();
      if (db === undefined) throw new Error('no more files');
      return db;
    });
    const hits = async () => {
      const reply = await state.handle(lexical(1));
      return reply.ok ? reply.hits?.length : reply.message;
    };
    expect(await hits()).toBe(1);
    expect(await state.handle({ id: 2, kind: 'reopen' })).toEqual({ id: 2, ok: true });
    expect(await hits()).toBe(2);
    fail = true;
    expect(await state.handle({ id: 3, kind: 'reopen' })).toEqual({
      id: 3,
      ok: false,
      message: 'unusable',
    });
    expect(await hits()).toBe(2);
    state.close();
  });
});
