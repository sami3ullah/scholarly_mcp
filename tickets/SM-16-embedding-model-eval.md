# SM-16 Embedding model evaluation (Phase 3)

Follows SM-08, whose recall targets were missed ([ADR 0026](../docs/adr/0026-golden-set-eval-and-tuning.md)), with the plan of [ADR 0027](../docs/adr/0027-measure-a-larger-embedding-model.md).

## Tasks

- [ ] Embedder adapter for bge-m3 (1024 dims, no prefixes, 8192 tokens), and for multilingual-e5-base as a middle step; dimensions configurable instead of the fixed 384
- [ ] Re-embed the eval index with each candidate, chunking unchanged, then with chunk sizes the model allows
- [ ] `eval golden` and `eval bench` per candidate, against e5-small on the same eval index
- [ ] Follow-up ADR with the numbers and the choice, superseding ADR 0002 and ADR 0027
- [ ] If a switch is chosen: full rebuild, new baseline, image size and cold start checked

## Exit

A recorded decision: switch to the candidate that meets recall@10 >= 0.8 overall and >= 0.7 cross-language (or clearly beats e5-small) with bench p95 <= 500 ms, or keep e5-small with the reasons.
