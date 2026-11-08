# 0010 multilingual-e5-small embeddings, in-process via ONNX

- Status: accepted, amended by [ADR 0028](0028-selectable-embedding-model.md) (the model and vector size became settings)
- Date: 2026-11-02
- Records: ARCHITECTURE.md key design decision 5 (confirmed by the spike, ADR 0002)

## Context

Queries and articles are in German and English, and a trial must run without external APIs or keys.

## Decision

Embed with multilingual-e5-small (384 dimensions) in-process through transformers.js and ONNX Runtime, using the `query:` and `passage:` prefixes the model requires. Every chunk stores its `modelVersion`; an index never mixes versions, and the store contract suite checks that a store refuses to.

## Consequences

- No external embedding service, fast on CPU, works offline.
- Changing the model means building a full new index.
- Revisit when golden-set recall misses its targets; the fallback is bge-m3.
