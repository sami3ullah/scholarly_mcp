# @scholarly-mcp/embedder-onnx

The `Embedder` adapter: a pinned ONNX embedding model (q8) in-process through transformers.js and ONNX Runtime on the CPU. Adds the prefixes the model needs (`passage: ` and `query: ` for e5, none for bge-m3), counts tokens with the model's tokenizer for the chunker, and limits concurrent model calls. Design rules: [ADR 0021](../../docs/adr/0021-chunking-language-and-embedder-rules.md), [ADR 0028](../../docs/adr/0028-selectable-embedding-model.md).

| `EMBEDDER_MODEL`                  | Hub model                      | Dimensions | Reads (tokens) | Pooling |
| --------------------------------- | ------------------------------ | ---------- | -------------- | ------- |
| `multilingual-e5-small` (default) | `Xenova/multilingual-e5-small` | 384        | 512            | mean    |
| `multilingual-e5-base`            | `Xenova/multilingual-e5-base`  | 768        | 512            | mean    |
| `bge-m3`                          | `Xenova/bge-m3`                | 1024       | 8192           | CLS     |

## Configuration

| Variable                | Default                 | Meaning                                                                                |
| ----------------------- | ----------------------- | -------------------------------------------------------------------------------------- |
| `EMBEDDER_MODEL`        | `multilingual-e5-small` | Which pinned model to load; an index holds one model, so changing it needs a new index |
| `EMBEDDER_CACHE_DIR`    | transformers.js default | Where the model files live; point it at the directory baked into an image              |
| `EMBEDDER_ALLOW_REMOTE` | `true`                  | `false` loads only from the cache and never downloads                                  |
| `EMBEDDER_BATCH_SIZE`   | `1`                     | Texts per model call; keep at 1 for reproducible vectors (ADR 0021)                    |
| `EMBEDDER_CONCURRENCY`  | `1`                     | Model calls at once, shared by queries and indexing                                    |

Each model's revision is pinned in `src/model.ts`; changing one changes its `version`, which every chunk stores, and needs a new index. The vector size comes from the model, so the index file is created for it.

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

`load-onnx-embedder.test.ts` runs the shared embedder contract against the default model. The first run downloads it (about 135 MB) into `.cache/models` at the repo root; CI caches that folder. The candidates are large (e5-base about 280 MB, bge-m3 about 570 MB), so their contract runs only when named: `EMBEDDER_CANDIDATE_TESTS=bge-m3,multilingual-e5-base pnpm test`.
