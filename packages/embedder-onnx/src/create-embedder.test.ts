import { EMBEDDING_DIMENSIONS } from '@scholarly-mcp/core';
import { describe, expect, it } from 'vitest';
import { createEmbedder, type ExtractFeatures } from './create-embedder.js';

const signal = new AbortController().signal;

/** A vector whose first value is the text's length, so tests can see which text it encodes. */
function vectorFor(text: string): Float32Array {
  const vector = new Float32Array(EMBEDDING_DIMENSIONS);
  vector[0] = text.length;
  return vector;
}

function recordingModel() {
  const calls: string[][] = [];
  const extract: ExtractFeatures = (texts) => {
    calls.push(texts);
    return Promise.resolve(texts.map(vectorFor));
  };
  return { calls, extract };
}

function embedderWith(extract: ExtractFeatures, batchSize = 2, concurrency = 1) {
  return createEmbedder({
    extract,
    countTokens: (text) => text.length,
    modelVersion: 'test-model@1',
    batchSize,
    concurrency,
  });
}

describe('createEmbedder', () => {
  it('prefixes passages and embeds them in batches, keeping their order', async () => {
    const model = recordingModel();
    const vectors = await embedderWith(model.extract).embedPassages(['a', 'bb', 'ccc'], signal);
    expect(model.calls).toEqual([['passage: a', 'passage: bb'], ['passage: ccc']]);
    expect(vectors.map((vector) => vector[0])).toEqual([10, 11, 12]);
  });

  it('prefixes queries for search', async () => {
    const model = recordingModel();
    await embedderWith(model.extract).embedQuery('Vorhofflimmern', signal);
    expect(model.calls).toEqual([['query: Vorhofflimmern']]);
  });

  it('exposes the model version, dimensions and token counter', () => {
    const embedder = embedderWith(recordingModel().extract);
    expect(embedder).toMatchObject({ modelVersion: 'test-model@1', dimensions: 384 });
    expect(embedder.countTokens('abc')).toBe(3);
  });

  it('does not call the model for no passages', async () => {
    const model = recordingModel();
    expect(await embedderWith(model.extract).embedPassages([], signal)).toEqual([]);
    expect(model.calls).toEqual([]);
  });

  it('lets a query run between the batches of a long indexing call', async () => {
    const order: string[] = [];
    let releaseFirst = (): void => undefined;
    const firstBatch = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const extract: ExtractFeatures = async (texts) => {
      order.push(texts[0] ?? '');
      if (texts[0] === 'passage: 1') await firstBatch;
      return texts.map(vectorFor);
    };
    const embedder = embedderWith(extract, 1);
    const indexing = embedder.embedPassages(['1', '2'], signal);
    const query = embedder.embedQuery('q', signal);
    releaseFirst();
    await Promise.all([indexing, query]);
    expect(order).toEqual(['passage: 1', 'query: q', 'passage: 2']);
  });

  it('stops between batches once aborted', async () => {
    const controller = new AbortController();
    const calls: string[][] = [];
    const extract: ExtractFeatures = (texts) => {
      calls.push(texts);
      controller.abort(new Error('cancelled'));
      return Promise.resolve(texts.map(vectorFor));
    };
    await expect(
      embedderWith(extract, 1).embedPassages(['1', '2'], controller.signal),
    ).rejects.toThrow('cancelled');
    expect(calls).toHaveLength(1);
  });

  it.each([
    ['too few vectors', () => Promise.resolve([])],
    ['vectors of the wrong size', () => Promise.resolve([new Float32Array(768)])],
  ])('fails loudly when the model returns %s', async (_case, extract: ExtractFeatures) => {
    await expect(embedderWith(extract).embedQuery('q', signal)).rejects.toThrow(
      'test-model@1 returned',
    );
  });
});
