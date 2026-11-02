import { describe, expect, it } from 'vitest';
import { EMBEDDING_MODELS, embeddingModelOf } from './model.js';

describe('EMBEDDING_MODELS', () => {
  const models = Object.values(EMBEDDING_MODELS);

  it('gives every model its own version, naming the pinned commit and weights', () => {
    expect(new Set(models.map((model) => model.version)).size).toBe(models.length);
    for (const model of models) {
      expect(model.revision).toMatch(/^[0-9a-f]{40}$/);
      expect(model.version).toBe(`${model.id}@${model.revision.slice(0, 12)}+q8`);
    }
  });

  it('keeps the e5-small version of existing indexes', () => {
    expect(EMBEDDING_MODELS['multilingual-e5-small'].version).toBe(
      'Xenova/multilingual-e5-small@761b726dd34f+q8',
    );
  });

  it('describes bge-m3 as a 1024-dimension CLS model without prefixes', () => {
    expect(embeddingModelOf({ EMBEDDER_MODEL: 'bge-m3' })).toMatchObject({
      dimensions: 1024,
      maxTokens: 8192,
      pooling: 'cls',
      prefixes: { passage: '', query: '' },
    });
  });
});
