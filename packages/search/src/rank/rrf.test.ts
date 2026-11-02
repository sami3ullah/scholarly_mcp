import type { Doi, RankedChunk } from '@scholarly-mcp/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { collapseToArticles } from './collapse-to-articles.js';
import { fuseRankings } from './rrf.js';

const hit = (chunkId: string, rank: number): RankedChunk => ({
  chunkId,
  doi: chunkId.split('#')[0] as Doi,
  rank,
});

describe('fuseRankings', () => {
  it('scores each chunk with the sum of 1 / (60 + rank) over its lists', () => {
    const fused = fuseRankings([[hit('a#0', 1), hit('b#0', 2)], [hit('b#0', 1)]]);
    expect(fused.map(({ chunkId }) => chunkId)).toEqual(['b#0', 'a#0']);
    expect(fused[0]?.score).toBeCloseTo(1 / 62 + 1 / 61, 12);
    expect(fused[1]?.score).toBeCloseTo(1 / 61, 12);
  });

  it('breaks equal scores by chunk id', () => {
    const fused = fuseRankings([[hit('z#0', 1)], [hit('a#0', 1)]]);
    expect(fused.map(({ chunkId }) => chunkId)).toEqual(['a#0', 'z#0']);
  });

  it('multiplies each list’s share by its weight', () => {
    const fused = fuseRankings([[hit('lex#0', 1)], [hit('vec#0', 1)]], 60, [1.2, 1]);
    expect(fused.map(({ chunkId }) => chunkId)).toEqual(['lex#0', 'vec#0']);
    expect(fused[0]?.score).toBeCloseTo(1.2 / 61, 12);
  });

  it('returns nothing for no hits', () => {
    expect(fuseRankings([[], []])).toEqual([]);
  });

  it('gives the same order whatever order the lists come in', () => {
    const list = fc
      .uniqueArray(fc.integer({ min: 0, max: 30 }), { maxLength: 15 })
      .map((ids) => ids.map((id, index) => hit(`10.1055/a-${String(id)}#0`, index + 1)));
    fc.assert(
      fc.property(list, list, (lexical, vector) => {
        expect(fuseRankings([lexical, vector])).toEqual(fuseRankings([vector, lexical]));
      }),
    );
  });
});

describe('collapseToArticles', () => {
  it('keeps one result per article, with its best chunk', () => {
    const collapsed = collapseToArticles(
      fuseRankings([[hit('a#1', 1), hit('b#0', 2), hit('a#0', 3)]]),
    );
    expect(collapsed.map(({ chunkId }) => chunkId)).toEqual(['a#1', 'b#0']);
  });
});
