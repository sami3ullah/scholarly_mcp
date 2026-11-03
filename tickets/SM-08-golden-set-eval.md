# SM-08 Golden set, eval and tuning (Phase 3)

## Tasks

- [x] 60-query golden set (20 DE, 20 EN, 20 cross-language/abbreviation/compound), relevance clear from title+abstract only, versioned file in testkit
- [x] Eval script: recall@10, MRR, nDCG@10; fails on regression (`eval golden --baseline` on the eval index; GitHub CI cannot run it, as an index holds article text, ADR 0026)
- [x] ~~Small committed index for CI eval~~ Replaced by a committed DOI list and `ingest subset`, which builds the eval index locally: a committed index would publish abstracts and full text (ADR 0026). Gate runs locally in a `pre-push` hook (ADR 0030)
- [x] Tune chunk size and candidate counts against the eval; record results (candidates kept at 50; chunk size needs a full re-embed and moves to SM-16)
- [x] Add the eval as a command of `apps/eval` next to `bench` (ADR 0023), using `createSearchService` as the server will
- [x] Decide with the eval: stem in the detected language only (current, per plan) or always in both (`LexicalQuery.language`); BM25 column weights (ADR 0022); `SEARCH_CANDIDATES`; abbreviation expansions in the embedded text
- [x] Re-run `pnpm eval bench` after tuning; p95 was 132 ms at 50 candidates before full text, 287 ms with it (SM-06: 176,433 chunks); 288 ms after SM-08
- [x] Seen in SM-06 on the enriched index: a rare word found only in an article's full text (`duodenography`) ranks that article second. First is an article whose title only shares a prefix or stem ("Duodeno", "duodenoscope"), and its `whyMatched` reads "Matched in title: duodenography", a word the title does not contain. `whyMatched` should name only terms that match the chunk, and an exact lexical hit on a rare term should beat a vector-only neighbour (`subtumoral`, `localising`)
- [x] Seen in SM-09 on the live index: DMW teasers can be a section heading ("Was ist neu?"); "atrial fibrillation anticoagulation" filtered to DMW ranks a defibrillation article first (ADR 0025)

## Exit

recall@10 >= 0.8 overall, >= 0.7 cross-language. If not met, ADR for switching to bge-m3.

**Result (2026-11-03): not met.** recall@10 0.68 overall, 0.56 cross-language on the live index; no ranking setting moved it beyond noise, and the embedding model is the limit. Decisions and numbers: [ADR 0026](../docs/adr/0026-golden-set-eval-and-tuning.md). The measurement of bge-m3 before any switch: [ADR 0027](../docs/adr/0027-measure-a-larger-embedding-model.md), ticket SM-16.
