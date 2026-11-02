import { EMBEDDING_DIMENSIONS, type Embedder } from '@scholarly-mcp/core';
import { beforeAll, describe, expect, it } from 'vitest';

/** Options for {@link runEmbedderContract}. */
export interface EmbedderContractOptions {
  /** Returns the embedder under test; called once for the whole suite. */
  readonly create: () => Embedder | Promise<Embedder>;
  /** Per-test timeout, for embedders that load a real model. */
  readonly timeoutMs?: number;
}

const signal = new AbortController().signal;
const TEXTS = [
  'Lower doses of rivaroxaban were not inferior in preventing stroke.',
  'Die Herzinsuffizienz ist eine häufige Erkrankung im höheren Lebensalter.',
  'Cholangiocarcinoma was diagnosed in three patients.',
];
/**
 * Float noise only. An index needs re-embedding an unchanged text to give the same vector,
 * whatever it was embedded alongside.
 */
const TOLERANCE = 1e-5;

function norm(vector: Float32Array): number {
  return Math.hypot(...vector);
}

function expectClose(actual: Float32Array, expected: Float32Array): void {
  const largest = Math.max(
    ...actual.map((value, index) => Math.abs(value - (expected[index] ?? 0))),
  );
  expect(largest).toBeLessThan(TOLERANCE);
}

/** The behaviour every embedder must share: shape, normalisation, determinism and aborts. */
export function runEmbedderContract(name: string, options: EmbedderContractOptions): void {
  const { create, timeoutMs } = options;
  const suiteOptions = timeoutMs === undefined ? {} : { timeout: timeoutMs };

  describe(`${name} satisfies the embedder contract`, suiteOptions, () => {
    let embedder: Embedder;
    beforeAll(async () => {
      embedder = await create();
    }, timeoutMs);

    it('names its model and has the index dimensions', () => {
      expect(embedder.modelVersion).toMatch(/\S/);
      expect(embedder.dimensions).toBe(EMBEDDING_DIMENSIONS);
    });

    it('returns one normalised vector per passage, in order', async () => {
      const vectors = await embedder.embedPassages(TEXTS, signal);
      expect(vectors).toHaveLength(TEXTS.length);
      for (const vector of vectors) {
        expect(vector).toBeInstanceOf(Float32Array);
        expect(vector).toHaveLength(EMBEDDING_DIMENSIONS);
        expect(norm(vector)).toBeCloseTo(1, 3);
      }
      const single = await embedder.embedPassages([TEXTS[1] ?? ''], signal);
      expectClose(vectors[1] ?? new Float32Array(), single[0] ?? new Float32Array());
    });

    it('returns no vectors for no passages', async () => {
      expect(await embedder.embedPassages([], signal)).toEqual([]);
    });

    it('is deterministic and tells different texts apart', async () => {
      const [first, again] = await Promise.all([
        embedder.embedQuery(TEXTS[0] ?? '', signal),
        embedder.embedQuery(TEXTS[0] ?? '', signal),
      ]);
      const other = await embedder.embedQuery(TEXTS[2] ?? '', signal);
      expect(first).toHaveLength(EMBEDDING_DIMENSIONS);
      expect(norm(first)).toBeCloseTo(1, 3);
      expect(again).toEqual(first);
      expect(other).not.toEqual(first);
    });

    it('counts more tokens for longer text and none for empty text', () => {
      const short = embedder.countTokens('stroke');
      expect(short).toBeGreaterThan(0);
      expect(embedder.countTokens(TEXTS[0] ?? '')).toBeGreaterThan(short);
      expect(embedder.countTokens('')).toBe(0);
    });

    it('rejects when the caller has already aborted', async () => {
      const aborted = AbortSignal.abort();
      await expect(embedder.embedPassages(TEXTS, aborted)).rejects.toThrow();
      await expect(embedder.embedQuery(TEXTS[0] ?? '', aborted)).rejects.toThrow();
    });
  });
}
