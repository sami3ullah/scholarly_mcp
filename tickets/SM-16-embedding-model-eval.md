# SM-16 Embedding model evaluation (Phase 3)

Follows SM-08, whose recall targets were missed ([ADR 0026](../docs/adr/0026-golden-set-eval-and-tuning.md)), with the plan of [ADR 0027](../docs/adr/0027-measure-a-larger-embedding-model.md).

## Tasks

- [x] Embedder adapter for bge-m3 (1024 dims, no prefixes, 8192 tokens), and for multilingual-e5-base as a middle step; dimensions configurable instead of the fixed 384 (`EMBEDDER_MODEL`, dimensions from the model; ADR 0028)
- [x] Re-embed the eval index with each candidate, chunking unchanged (`ingest reembed`). Not done: larger chunk sizes, which need a full re-ingest; skipped with reasons in ADR 0029
- [x] `eval golden` and `eval bench` per candidate, against e5-small on the same eval index, after judging the candidates' unjudged top ten (golden set v2)
- [x] Follow-up ADR with the numbers and the choice, superseding ADR 0002 and ADR 0027 (ADR 0029: keep e5-small)
- [x] If a switch is chosen: full rebuild, new baseline, image size and cold start checked (no switch, so not needed)

## Exit

A recorded decision: switch to the candidate that meets recall@10 >= 0.8 overall and >= 0.7 cross-language (or clearly beats e5-small) with bench p95 <= 500 ms, or keep e5-small with the reasons.

## Result

Exit met by the second branch: e5-small is kept ([ADR 0029](../docs/adr/0029-keep-e5-small-after-model-comparison.md)). On golden set v2, bge-m3 scores recall@10 0.697 overall and 0.665 cross-language against 0.680 and 0.600; no difference is outside a paired bootstrap 95% interval, German drops, and the vector scan and storage grow 2.7 times.
