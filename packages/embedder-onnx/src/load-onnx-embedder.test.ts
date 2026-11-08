import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chunkDocument, doiSchema, type Embedder } from '@scholarly-mcp/core';
import { runEmbedderContract } from '@scholarly-mcp/testkit';
import { describe, expect, it } from 'vitest';
import { loadOnnxEmbedder } from './load-onnx-embedder.js';
import { EMBEDDING_MODELS, type EmbeddingModelName } from './model.js';

/** Shared with CI's cache step, so the model downloads once per revision. */
const CACHE_DIR = fileURLToPath(new URL('../../../.cache/models', import.meta.url));
/** The first run downloads about 120 MB. */
const TIMEOUT_MS = 300_000;
const signal = new AbortController().signal;

/**
 * The candidate models of ADR 0027 are hundreds of MB each, so their contract runs only when
 * asked for, e.g. `EMBEDDER_CANDIDATE_TESTS=bge-m3,multilingual-e5-base`.
 */
const CANDIDATES = (process.env['EMBEDDER_CANDIDATE_TESTS'] ?? '')
  .split(',')
  .map((name) => name.trim())
  .filter((name): name is EmbeddingModelName => name in EMBEDDING_MODELS);

const loading = new Map<EmbeddingModelName, Promise<Embedder>>();
function embedder(name: EmbeddingModelName = 'multilingual-e5-small'): Promise<Embedder> {
  let model = loading.get(name);
  if (model === undefined) {
    model = loadOnnxEmbedder({
      EMBEDDER_MODEL: name,
      EMBEDDER_CACHE_DIR: CACHE_DIR,
      EMBEDDER_ALLOW_REMOTE: true,
      EMBEDDER_BATCH_SIZE: 1,
      EMBEDDER_CONCURRENCY: 1,
    });
    loading.set(name, model);
  }
  return model;
}

function cosine(a: Float32Array, b: Float32Array): number {
  return a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
}

runEmbedderContract('onnx multilingual-e5-small', {
  create: () => embedder(),
  timeoutMs: TIMEOUT_MS,
});
for (const name of CANDIDATES) {
  runEmbedderContract(`onnx ${name}`, { create: () => embedder(name), timeoutMs: TIMEOUT_MS });
}

describe('loadOnnxEmbedder', { timeout: TIMEOUT_MS }, () => {
  it('matches a German query to the English passage on its topic', async () => {
    const model = await embedder();
    const [onTopic, offTopic] = await model.embedPassages(
      [
        'Echocardiography in neonates with arterial ischemic stroke.',
        'Photoredox-catalysed difluoroallylation of amides.',
      ],
      signal,
    );
    const query = await model.embedQuery(
      'Echokardiographie bei Neugeborenen mit Schlaganfall',
      signal,
    );
    expect(cosine(query, onTopic ?? query)).toBeGreaterThan(cosine(query, offTopic ?? query));
  });

  it('embeds the same text differently as a query and as a passage', async () => {
    const model = await embedder();
    const text = 'Rivaroxaban dosing in atrial fibrillation';
    const [passage] = await model.embedPassages([text], signal);
    expect(await model.embedQuery(text, signal)).not.toEqual(passage);
  });

  it('counts subword tokens, so German compounds cost more than one token', async () => {
    const model = await embedder();
    expect(model.countTokens('Herzinsuffizienzbehandlung')).toBeGreaterThan(1);
  });

  it('sizes chunks so the title and chunk fit what the model reads', async () => {
    const model = await embedder();
    const sentence =
      'Die Patienten mit chronischer Herzinsuffizienz erhielten über zwölf Monate eine ' +
      'leitliniengerechte Therapie mit Sacubitril/Valsartan.';
    const chunks = chunkDocument(
      {
        doi: doiSchema.parse('10.1055/a-1'),
        title: 'Sacubitril/Valsartan bei Herzinsuffizienz: Ergebnisse einer Registerstudie',
        sections: [
          {
            paragraphs: [Array(60).fill(sentence).join(' ')],
            origin: 'abstract',
            source: 'crossref',
          },
        ],
      },
      { countTokens: model.countTokens },
    );
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(400);
      // `passage: ` plus the two special tokens the model adds.
      const read = model.countTokens(`passage: ${chunk.embeddingText}`) + 2;
      expect(read).toBeLessThanOrEqual(EMBEDDING_MODELS['multilingual-e5-small'].maxTokens);
    }
  });

  it('fails clearly when downloads are off and the model is not cached', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'embedder-'));
    await expect(
      loadOnnxEmbedder({
        EMBEDDER_MODEL: 'multilingual-e5-small',
        EMBEDDER_CACHE_DIR: empty,
        EMBEDDER_ALLOW_REMOTE: false,
        EMBEDDER_BATCH_SIZE: 1,
        EMBEDDER_CONCURRENCY: 1,
      }),
    ).rejects.toThrow('from the local model cache (EMBEDDER_ALLOW_REMOTE=false)');
  });
});
