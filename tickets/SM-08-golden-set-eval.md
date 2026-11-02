# SM-08 Golden set, eval and tuning (Phase 3)

## Tasks

- [ ] 60-query golden set (20 DE, 20 EN, 20 cross-language/abbreviation/compound), relevance clear from title+abstract only, versioned file in testkit
- [ ] Eval script: recall@10, MRR, nDCG@10; CI fails on regression
- [ ] Small committed index for CI eval
- [ ] Tune chunk size and candidate counts against the eval; record results

## Exit

recall@10 >= 0.8 overall, >= 0.7 cross-language. If not met, ADR for switching to bge-m3.
