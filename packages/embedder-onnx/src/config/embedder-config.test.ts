import { parseConfig } from '@scholarly-mcp/core';
import { describe, expect, it } from 'vitest';
import { embedderConfigSchema } from './embedder-config.js';

describe('embedderConfigSchema', () => {
  it('needs nothing and fills safe defaults', () => {
    expect(parseConfig(embedderConfigSchema, {})).toEqual({
      EMBEDDER_MODEL: 'multilingual-e5-small',
      EMBEDDER_ALLOW_REMOTE: true,
      EMBEDDER_BATCH_SIZE: 1,
      EMBEDDER_CONCURRENCY: 1,
    });
  });

  it('accepts a baked-in model directory with downloads switched off', () => {
    const config = parseConfig(embedderConfigSchema, {
      EMBEDDER_CACHE_DIR: '/models',
      EMBEDDER_ALLOW_REMOTE: 'false',
    });
    expect(config).toMatchObject({ EMBEDDER_CACHE_DIR: '/models', EMBEDDER_ALLOW_REMOTE: false });
  });

  it('accepts a candidate model by name', () => {
    expect(parseConfig(embedderConfigSchema, { EMBEDDER_MODEL: 'bge-m3' })).toMatchObject({
      EMBEDDER_MODEL: 'bge-m3',
    });
  });

  it.each([
    ['an unknown model', { EMBEDDER_MODEL: 'e5-large' }, 'EMBEDDER_MODEL'],
    ['a batch size of zero', { EMBEDDER_BATCH_SIZE: '0' }, 'BATCH_SIZE'],
    ['a non-boolean switch', { EMBEDDER_ALLOW_REMOTE: 'maybe' }, 'ALLOW_REMOTE'],
    ['too much concurrency', { EMBEDDER_CONCURRENCY: '64' }, 'CONCURRENCY'],
  ])('fails fast on %s', (_case, env, variable) => {
    expect(() => parseConfig(embedderConfigSchema, env)).toThrow(variable);
  });
});
