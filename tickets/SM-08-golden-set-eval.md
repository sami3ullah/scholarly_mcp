# SM-08 Golden set, eval and tuning (Phase 3)

## Tasks

- [ ] 60-query golden set (20 DE, 20 EN, 20 cross-language/abbreviation/compound), relevance clear from title+abstract only, versioned file in testkit
- [ ] Eval script: recall@10, MRR, nDCG@10; CI fails on regression
- [ ] Small committed index for CI eval
- [ ] Tune chunk size and candidate counts against the eval; record results
- [ ] Add the eval as a command of `apps/eval` next to `bench` (ADR 0023), using `createSearchService` as the server will
- [ ] Decide with the eval: stem in the detected language only (current, per plan) or always in both (`LexicalQuery.language`); BM25 column weights (ADR 0022); `SEARCH_CANDIDATES`; abbreviation expansions in the embedded text
- [ ] Re-run `pnpm eval bench` after tuning; p95 was 132 ms at 50 candidates before full text, 287 ms with it (SM-06: 176,433 chunks)
- [ ] Seen in SM-06 on the enriched index: a rare word found only in an article's full text (`duodenography`) ranks that article second. First is an article whose title only shares a prefix or stem ("Duodeno", "duodenoscope"), and its `whyMatched` reads "Matched in title: duodenography", a word the title does not contain. `whyMatched` should name only terms that match the chunk, and an exact lexical hit on a rare term should beat a vector-only neighbour (`subtumoral`, `localising`)
- [ ] Seen in SM-09 on the live index: DMW teasers can be a section heading ("Was ist neu?"); "atrial fibrillation anticoagulation" filtered to DMW ranks a defibrillation article first (ADR 0025)

## Exit

recall@10 >= 0.8 overall, >= 0.7 cross-language. If not met, ADR for switching to bge-m3.
