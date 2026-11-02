# @scholarly-mcp/embedder-onnx

The `Embedder` adapter: multilingual-e5-small (384 dimensions, q8) in-process through transformers.js and ONNX Runtime on the CPU. Adds the `passage: ` and `query: ` prefixes e5 needs, counts tokens with the model's tokenizer for the chunker, and limits concurrent model calls. Design rules: [ADR 0021](../../docs/adr/0021-chunking-language-and-embedder-rules.md).

## Configuration

| Variable                | Default                 | Meaning                                                                   |
| ----------------------- | ----------------------- | ------------------------------------------------------------------------- |
| `EMBEDDER_CACHE_DIR`    | transformers.js default | Where the model files live; point it at the directory baked into an image |
| `EMBEDDER_ALLOW_REMOTE` | `true`                  | `false` loads only from the cache and never downloads                     |
| `EMBEDDER_BATCH_SIZE`   | `1`                     | Texts per model call; keep at 1 for reproducible vectors (ADR 0021)       |
| `EMBEDDER_CONCURRENCY`  | `1`                     | Model calls at once, shared by queries and indexing                       |

The model and its revision are fixed in `src/model.ts`; changing them changes `MODEL_VERSION` and needs a new index.

## Usage

```ts
const embedder = await loadOnnxEmbedder(parseConfig(embedderConfigSchema, process.env)); // ready
const drafts = chunkDocument(document, { countTokens: embedder.countTokens });
const vectors = await embedder.embedPassages(
  drafts.map((draft) => draft.embeddingText),
  signal,
);
const query = await embedder.embedQuery(text, AbortSignal.timeout(2_000));
```

## Tests

`load-onnx-embedder.test.ts` runs the shared embedder contract against the real model. The first run downloads it (about 135 MB) into `.cache/models` at the repo root; CI caches that folder.
