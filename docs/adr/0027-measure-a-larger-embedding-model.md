# 0027 Measure a larger embedding model before switching

- Status: superseded by [ADR 0029](0029-keep-e5-small-after-model-comparison.md) (done: e5-small kept)
- Date: 2026-11-03
- Follows: ADR 0002 ("revisit only if the golden set misses its targets; the fallback is bge-m3"), ARCHITECTURE.md key design decision 5, ADR 0026

## Context

The golden set misses both targets on the live index: recall@10 is 0.68 overall (target 0.8) and 0.56 cross-language (target 0.7); German queries reach 0.59 (ADR 0026). No ranking setting moved recall beyond noise. Vector search alone reaches 0.65 and is the stronger retriever; on German queries both retrievers are weak (vector 0.55, lexical 0.50). The feasibility spike measured top-1 on ten German-to-English pairs, which a small model passes; the golden set asks for the top ten of a real corpus.

Switching is not free. bge-m3 has 1024 dimensions against 384, so `EMBEDDING_DIMENSIONS`, the `vec_chunks` check and the vector scan change; it is about five times the parameters, so query embedding and the full rebuild (2 h 50 min today) get slower and the image larger; it uses no `query:`/`passage:` prefixes and allows 8192 tokens, so chunking rules (ADR 0021) would be revisited with it. A switch without numbers could cost latency and gain little.

## Decision

Measure before deciding, on the eval index of ADR 0026, which is small enough to re-embed in minutes:

1. Re-embed the eval index's 2,959 articles with each candidate (bge-m3; multilingual-e5-base as a cheaper middle step) through an embedder adapter for that model, chunking unchanged first, then with chunk sizes the model allows.
2. Run `eval golden` on each, and `eval bench` for query latency on a CPU like production's.
3. Switch only if a candidate reaches the targets on the eval index, or clearly beats e5-small, with p95 within the 500 ms bench budget. Record the numbers and the choice in a follow-up ADR that supersedes this one and ADR 0002.

## Consequences

- The tuning work closes with the targets unmet and this plan as the follow-up; the measurement comes next (ADR 0028, ADR 0029).
- Until then e5-small stays, with the tuning fixes (ADR 0026).
- The model version is stored per chunk, so a switch is a full rebuild, never a mixed index.
