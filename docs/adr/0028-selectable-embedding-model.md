# 0028 Selectable embedding model with model-sized vectors

- Status: accepted
- Date: 2026-11-03
- Changes: ADR 0010 and ADR 0021 (one fixed model and vector size), ARCHITECTURE.md key design decision 5
- For: ADR 0027

## Context

The model comparison measures embedding models on the eval index (ADR 0027). The code had one model and one vector size built in: `EMBEDDING_DIMENSIONS = 384` in core, checked by the chunk schema, the embedder, the testkit contract and the `vec_chunks` column check; the model id, revision and `passage: `/`query: ` prefixes fixed in `embedder-onnx`. bge-m3 has 1024 dimensions, CLS pooling and no prefixes; multilingual-e5-base has 768. Measuring them, and switching later if the numbers say so, needs the model to be a setting, not a code change, and an index must still never mix models.

## Decision

1. **The model is a setting.** `EMBEDDER_MODEL` names one entry of a table in `embedder-onnx/src/model.ts`: `multilingual-e5-small` (default), `multilingual-e5-base`, `bge-m3`. Each entry pins the Hub id, the commit, q8 weights, dimensions, the tokens the model reads, pooling and prefixes. Its `version` (id, short commit, dtype) is what chunks and `index_meta` store; the e5-small version is unchanged, so existing indexes stay valid. Dimensions are not a separate setting: they belong to the model, and a second knob could only disagree with it.
2. **Vectors take the model's size.** Core no longer has a vector size; a chunk's embedding only has to be non-empty. The embedder checks every vector against its model's dimensions. A full build creates the index file for the embedder's size (`createIndexSchema(db, { dimensions })`), so the `vec_chunks` column check still holds one size per file. The layout version is unchanged: the schema is the same for every model, and an e5-small file is byte for byte what it was.
3. **No build crosses models.** A leftover build of another vector size is discarded, not resumed. An incremental or purge build refuses a live index of another size. `ingest incremental` plans a full run when the live index was built with another model (`embedding model changed`); the full run re-embeds, since reuse already requires the same model version per chunk. The server and eval open the index with the configured model's version and keep refusing any other.
4. **`ingest reembed --from <index> --out <index>`** copies an index with every chunk embedded again by the configured model, chunking unchanged: each chunk is embedded from its stored text with the article title in front (`embeddingTextOf`, the chunker's own rule), so full text is never fetched again. It writes only to `--out`, is verified like any build, and resumes: articles already in the build are kept.
5. **Tests.** The testkit fakes keep 384 (`TEST_EMBEDDING_DIMENSIONS`). The embedder contract checks vectors against the embedder's own dimensions. Real-model tests run the default model; candidates run only when named in `EMBEDDER_CANDIDATE_TESTS`, as they are 280-570 MB downloads.

## Consequences

- Switching models is a config change plus a full rebuild; nothing in core, store or search changes.
- Re-chunking for a model that reads more than 512 tokens is not covered by `reembed`, which keeps chunks as they are: it needs the source text, so it is a full ingest with other chunk sizes.
- The model table is code, so a new candidate is a reviewed change with a pinned commit, never a free-form Hub id from the environment.
