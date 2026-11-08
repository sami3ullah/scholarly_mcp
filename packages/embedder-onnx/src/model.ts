/** How a model turns its token vectors into one text vector. */
export type Pooling = 'mean' | 'cls';

/**
 * An ONNX embedding model on the Hugging Face Hub, pinned to one commit so every build loads
 * the same weights. Changing any field changes `version`, which every chunk stores, so it
 * needs a full new index (ADR 0010, ADR 0028).
 */
export interface EmbeddingModel {
  readonly id: string;
  readonly revision: string;
  /** 8-bit quantised weights for every model: the variant ADR 0002 measured. */
  readonly dtype: 'q8';
  readonly dimensions: number;
  /** Tokens the model reads at most, special tokens included; longer input is truncated. */
  readonly maxTokens: number;
  readonly pooling: Pooling;
  /** Put in front of indexed text and of searches; e5 needs them, bge-m3 none. */
  readonly prefixes: { readonly passage: string; readonly query: string };
  /** Stored on every chunk; an index never mixes versions. */
  readonly version: string;
}

function model(spec: Omit<EmbeddingModel, 'version'>): EmbeddingModel {
  return { ...spec, version: `${spec.id}@${spec.revision.slice(0, 12)}+${spec.dtype}` };
}

const E5_PREFIXES = { passage: 'passage: ', query: 'query: ' } as const;

/**
 * The models `EMBEDDER_MODEL` can name. multilingual-e5-small is the default (ADR 0002); the
 * others are the candidates ADR 0027 measured (ADR 0029).
 */
export const EMBEDDING_MODELS = {
  'multilingual-e5-small': model({
    id: 'Xenova/multilingual-e5-small',
    revision: '761b726dd34fb83930e26aab4e9ac3899aa1fa78',
    dtype: 'q8',
    dimensions: 384,
    maxTokens: 512,
    pooling: 'mean',
    prefixes: E5_PREFIXES,
  }),
  'multilingual-e5-base': model({
    id: 'Xenova/multilingual-e5-base',
    revision: '1ec9243030a27d1a115d5c340572074c125b58b2',
    dtype: 'q8',
    dimensions: 768,
    maxTokens: 512,
    pooling: 'mean',
    prefixes: E5_PREFIXES,
  }),
  // Dense retrieval only: the CLS vector, normalised, with no instruction or prefix.
  'bge-m3': model({
    id: 'Xenova/bge-m3',
    revision: '4de13258303883538bd53b696b452bf8099f0858',
    dtype: 'q8',
    dimensions: 1024,
    maxTokens: 8192,
    pooling: 'cls',
    prefixes: { passage: '', query: '' },
  }),
} as const satisfies Record<string, EmbeddingModel>;

export type EmbeddingModelName = keyof typeof EMBEDDING_MODELS;

export const DEFAULT_EMBEDDING_MODEL: EmbeddingModelName = 'multilingual-e5-small';

/** The model a config names, so callers can open an index before the model has loaded. */
export function embeddingModelOf(config: { readonly EMBEDDER_MODEL: EmbeddingModelName }) {
  return EMBEDDING_MODELS[config.EMBEDDER_MODEL];
}
