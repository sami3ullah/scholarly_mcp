# 0026 Golden set, eval and tuning results

- Status: accepted
- Date: 2026-11-03
- Fills gaps in: ARCHITECTURE.md "Testing strategy" (evaluation), ADR 0011, ADR 0022 and ADR 0023

## Context

The evaluation needs a 60-query golden set, recall@10, MRR and nDCG@10 with a regression gate, and for tuning decisions made against it: candidate counts, BM25 column weights, stemming in the detected language or both, abbreviation expansions in the embedded text. Building Europe PMC enrichment (ADR 0024) and the MCP server (ADR 0025) surfaced ranking faults: a rare word found only in one article's full text lost to a neighbour by meaning, `whyMatched` named a word the title did not contain, a DMW teaser was a heading, and a DMW-filtered "atrial fibrillation anticoagulation" search ranked a defibrillation article first.

## Decision

1. **The golden set** is `packages/testkit/golden/golden-set.json`, version 1: 60 queries (20 German, 20 English, 20 cross-language, abbreviation or compound), each with its information need and graded judgments (2 highly, 1 partially relevant), 1,257 in all. The queries were written before any results were seen. Candidates were pooled from six runs per query: the pipeline (top 20), lexical only in the query language and in both languages, vector only, the pre-enrichment index, and a search for the English need (which found relevant articles every other run missed, such as all three for "Frühgeburt Progesteron"). Judges saw title and abstract only, blind to which run found an article, in shuffled order. Every judgment followed one written rubric (in the file), one query group at a time; a spot check of 24 random judgments by the author agreed with all of them. Unjudged results count as not relevant. A change of queries or judgments bumps `version`.
2. **Metrics** over the first page of ten: recall@10 capped at the number of relevant articles (found ÷ min(relevant, 10), so a query with 50 relevant articles can still reach 1), MRR from the first relevant result, nDCG@10 with gain 2^grade − 1. Means are over the queries with at least one relevant article.
3. **`eval golden`** in `apps/eval` runs the set through `createSearchService`, as the server does, and prints the summary; `--show` lists each query's grades in rank order. Without `--baseline` it exits 1 below the targets (recall 0.8 overall, 0.7 cross-language).
4. **No committed index; a committed DOI list.** An index of the pooled articles holds their abstracts and CC BY-NC-ND full text. Committing it would publish article content, which the hard rules and ADR 0003 forbid, and every other route (hashed tokens, fetching and embedding about 2,000 articles per CI run) either tests a different code path or is slow and flaky. So the repository holds `packages/testkit/golden/corpus-dois.txt` (the 2,959 pooled articles) and `baseline.json`. `ingest subset --from <index> --dois <file> --out <index>` builds the eval index from a local live index, reusing stored chunks and embeddings, verified like any build; it writes only to `--out`, never to `INDEX_PATH`. `eval golden --baseline` on that index exits 1 when any overall or per-group score drops by more than float noise, and 2 when the baseline was made on another golden set version or corpus. The search is deterministic, so a drop is a real ranking change; a change that lowers a score on purpose rewrites the baseline with `--write-baseline` in the same commit. GitHub CI does not run the gate, as it has no index (see Consequences).
5. **Lexical weight 1.01 in fusion.** At the same rank, an exact word match beats a neighbour by meaning. All three full-text enrichment cases (`duodenography`, `subtumoral`, `localising`) were exact ties between lexical rank 1 and vector rank 1, broken by chunk id; they now rank the exact hit first. Larger weights lowered recall (table below), so the weight only breaks ties and near-ties.
6. **`whyMatched` names a term only when the text contains it**, allowing a short ending of the query word ("patients" for "patient", "Vorhofflimmertherapie" for "Vorhofflimmern"), but not a text word that is only a prefix or stem of the query word ("Duodeno" or "duodenal" for "duodenography").
7. **Trigram hits only at compound edges.** A trigram top-up hit counts only where a word of the title or text starts with a query stem, or holds it after a first part of at least four letters with at most three letters after it ("Darmkrebs", "Darmkrebses"). A stem after a short prefix or deep inside a word is a different word ("fibrill" in "Defibrillation"). The trigram top-up never changed a golden score either way, as it fires only when the main table finds fewer than 50 chunks; it stays for compound queries (search service tests).
8. **A teaser skips a short opening question** of at most four words when more sentences follow, such as DMW's "Was ist neu?" box heading (88 DMW abstracts open with it).
9. **Kept as they are, by the eval:** 50 candidates per side, RRF k = 60, BM25 weights (1.0, 0.5, 2.0), abbreviation expansions in the embedded text, and stemming in the detected language with both languages otherwise. Language detection returns no language for almost every short query, so lexical search already stems in both languages; forcing both changed nothing. No German decompounding: splitting compounds into OR'ed parts lowered recall sharply.

### Results

Live index, 70,911 articles and 176,433 chunks; golden set version 1. Recall@10 / nDCG@10; differences under about 0.02 are one or two queries and within noise.

| Run                                             | Overall     | MRR   | de          | en          | cross       |
| ----------------------------------------------- | ----------- | ----- | ----------- | ----------- | ----------- |
| Pre-enrichment index                            | 0.667/0.616 | 0.888 | 0.533/0.476 | 0.880/0.797 | 0.589/0.576 |
| Enriched index before tuning                    | 0.680/0.630 | 0.892 | 0.591/0.516 | 0.890/0.812 | 0.560/0.562 |
| **Enriched index after tuning** (decisions 5-8) | 0.679/0.629 | 0.892 | 0.586/0.514 | 0.895/0.813 | 0.555/0.559 |
| Vector only                                     | 0.651/0.604 | 0.888 | 0.548/0.498 | 0.850/0.762 | 0.557/0.553 |
| Lexical only                                    | 0.594/0.537 | 0.799 | 0.498/0.459 | 0.815/0.711 | 0.470/0.442 |

Variants tried on the enriched index, against 0.680/0.630 before tuning:

| Variant                                                | Overall                                     |
| ------------------------------------------------------ | ------------------------------------------- |
| Lexical weight 0.8 / 1.2 / 1.5 / 2                     | 0.677 / 0.664 / 0.663 / 0.654 recall        |
| 100 / 200 candidates                                   | 0.669/0.623, 0.673/0.625                    |
| RRF k = 20 / 100                                       | 0.672/0.623, 0.679/0.630                    |
| Both languages always stemmed                          | 0.680/0.630 (identical)                     |
| No expansions in the embedded text                     | 0.681/0.630                                 |
| All-words lexical tier first, then any word            | 0.684/0.641                                 |
| Fusion per article instead of per chunk                | 0.670/0.624                                 |
| Article fusion, all-words tier, 100 candidates, k = 30 | 0.693/0.642                                 |
| Separate all-words list in fusion                      | 0.684/0.629                                 |
| Trigram top-up off                                     | 0.679/0.629 (identical)                     |
| Eight compound queries split by hand (upper bound)     | recall fell on all eight; x-08 0.70 to 0.10 |

BM25 weights on the eval index (0.690/0.630 as set): (1.0, 0.5, 1.0) 0.694/0.633, (1.0, 0.5, 0.5) 0.685/0.630, (1.0, 1.0, 2.0) 0.689/0.634, (1.0, 0.0, 2.0) 0.687/0.627, (1.0, 0.5, 4.0) 0.699/0.632.

The eval index (2,959 articles, 15,946 chunks) scores 0.690/0.630, MRR 0.888 (de 0.566/0.489, en 0.905/0.817, cross 0.600/0.585), close to the live index, as it holds the hard negatives the pools found.

Bench after tuning, live index, 5 rounds: p50 207.8 ms, p95 288.4 ms (287 ms before), no failures.

## Consequences

- **The recall targets are not met**: recall@10 is 0.68 overall (target 0.8) and 0.56 cross-language (target 0.7). No fusion, candidate, BM25 or stemming setting moves recall beyond noise, because both retrievers are weak on their own: vector only reaches 0.65 and lexical only 0.59, and German queries score 0.55 and 0.50. The embedding model is the limit; ADR 0027 plans the measurement of a larger model.
- Enrichment helped German queries (+0.06 recall) and cost cross-language ones a little (−0.03); vector-only recall is 0.011 lower on the enriched index, so full-text chunks crowd the nearest neighbours slightly.
- Chunk size is not tuned: it needs the whole corpus re-embedded (about 3 hours), and a model change re-chunks anyway, so it moves to ADR 0027's measurement.
- The regression gate runs where an index is: before a ranking change is committed, `ingest subset` once, then `eval golden --baseline`. GitHub CI cannot run it without article text, so a ranking change can still be merged untested by mistake; a self-hosted runner with the index, or an index of open (CC BY) articles only, could close that gap later.
- The judgments are from title and abstract only, so relevance is as a careful reader would see it, not as a clinician would; a second judging pass or clinician review would make the targets firmer.
- Rare-word, label, teaser and compound-edge fixes have unit tests, as the golden set holds no rare-word query.
