# SM-04 Chunker and ONNX embedder (Phase 2)

## Tasks

- [x] Pure chunker in core: structure first (abstract sections, full-text sections), 200-400 token limit, sentence fallback, 1-2 sentence overlap, title prepended to embedding text
- [x] Per-paragraph language detection; language stored per chunk
- [x] Property test: chunker never loses or duplicates text (ignoring overlap)
- [x] `packages/embedder-onnx`: multilingual-e5-small via transformers.js, `query:`/`passage:` prefixes, batching, semaphore on concurrency, model version exposed
- [x] Embedder contract (dims = 384, deterministic, normalised)

## Exit

Unit + property tests green; embedder runs in Node 24 on CPU.
