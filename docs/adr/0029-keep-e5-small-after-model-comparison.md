# 0029 Keep multilingual-e5-small after the embedding model comparison

- Status: accepted
- Date: 2026-11-03
- Supersedes: ADR 0002 (keep e5-small after the spike), ADR 0027 (measure a larger model first)
- For: ticket SM-16, PLAN.md key design decision #5

## Context

The golden set misses the SM-08 targets (recall@10 0.8 overall, 0.7 cross-language; ADR 0026), and ADR 0027 asked to measure bge-m3, with multilingual-e5-base as a middle step, before deciding on a switch. ADR 0028 made the model a setting and added `ingest reembed`, which embeds the eval index's 15,946 chunks again with another model, chunking unchanged.

## Method

1. The eval index (2,959 articles) was re-embedded with each candidate, q8 weights, pinned commits (`EMBEDDER_MODEL`, ADR 0028): e5-base in 13 min, bge-m3 in 33 min, on an Apple M-series CPU.
2. **Pooling bias was removed before comparing.** Golden set v1 was pooled from e5-small runs, and results nobody judged count as not relevant, so a different model is penalised for finding unjudged articles. Each candidate's top ten (`eval golden --rankings`) that was neither graded relevant nor in e5-small's top ten, 172 query-article pairs, was judged blind from title and abstract with the v1 rubric by three Claude agents, one per query group, in shuffled order. Mixed in were 15 already-graded pairs as a check: all 15 were judged relevant again, 11 with the same grade. The pairs yielded 18 new relevant judgments (17 grade 1, 1 grade 2), which make golden set **version 2** (1,276 judgments). Every model below is scored on v2.
3. `eval bench --rounds 5` on each eval index, and a synthetic vector scan of 176,433 chunks (the live index's count) at 384 and 1024 dimensions.

## Results

Golden set v2 on the eval index (recall@10, MRR, nDCG@10):

| Model                 | Recall | MRR   | nDCG  | de recall | en recall | cross recall |
| --------------------- | ------ | ----- | ----- | --------- | --------- | ------------ |
| multilingual-e5-small | 0.680  | 0.888 | 0.627 | 0.566     | 0.873     | 0.600        |
| multilingual-e5-base  | 0.677  | 0.875 | 0.622 | 0.548     | 0.897     | 0.585        |
| bge-m3                | 0.697  | 0.924 | 0.642 | 0.533     | 0.892     | 0.665        |

Per-query recall against e5-small, mean difference with a paired bootstrap 95% interval (5,000 resamples), and queries better / worse:

| Model   | Overall                       | de                          | en                          | cross                       |
| ------- | ----------------------------- | --------------------------- | --------------------------- | --------------------------- |
| e5-base | −0.003 [−0.038, +0.030] 15/14 | −0.017 [−0.090, +0.045] 6/6 | +0.023 [−0.010, +0.062] 4/2 | −0.015 [−0.080, +0.045] 5/6 |
| bge-m3  | +0.017 [−0.027, +0.061] 18/16 | −0.033 [−0.100, +0.029] 5/8 | +0.018 [−0.027, +0.072] 4/4 | +0.065 [−0.033, +0.163] 9/4 |

On the v1 judgments alone the order was the same but e5-small looked better (e5-small 0.690, e5-base 0.656, bge-m3 0.684), which is the pooling bias step 2 removed.

Cost:

| Model    | Bench p50 / p95 (eval index) | Vector scan, 176k chunks    | Vectors on the live index | Model files |
| -------- | ---------------------------- | --------------------------- | ------------------------- | ----------- |
| e5-small | 26 / 37 ms                   | 66 ms                       | 271 MB                    | 129 MB      |
| e5-base  | 43 / 58 ms                   | about 120 ms (interpolated) | 542 MB                    | 288 MB      |
| bge-m3   | 50 / 65 ms                   | 175 ms                      | 723 MB                    | 560 MB      |

On the live index (bench p95 288 ms with e5-small, ADR 0026) bge-m3 would add about 110 ms of scan and about 25 ms of query embedding: an estimated p95 near 420 ms, inside the 500 ms budget with little room. A full rebuild re-embeds 176k chunks; at the measured 7.5 chunks per second that is about 6.5 hours of embedding on top of the Europe PMC fetches.

## Decision

**Keep multilingual-e5-small.** Neither candidate reaches the SM-08 targets (bge-m3: 0.697 overall, 0.665 cross-language), and neither clearly beats e5-small: every interval includes zero. bge-m3's one promising difference, cross-language recall, is uncertain (+0.065, interval −0.033 to +0.163) and comes with a German loss (8 queries worse, 5 better). e5-base is no better on any group. A switch would cost about 2.7 times the vector scan and storage, four times the model size and a much longer rebuild for no measured gain.

The ticket's second re-embedding, with chunk sizes bge-m3 allows (up to 8192 tokens), was not run. It needs the source text, so it is a full ingest (Europe PMC full text included, hours), and with chunks unchanged bge-m3 already showed no significant gain; most articles are one abstract chunk under 400 tokens, so larger chunks would change only the full-text half of the index, which feeds matching, not cards.

## Consequences

- The recall gap is not the embedding model's alone. The next levers are query-side, where German and cross-language queries lose: query translation or expansion of the German need into English, and a reranker over the fused top 50 (SM-08 left both open). They need their own ADR and measurement on golden set v2.
- `EMBEDDER_MODEL` stays (ADR 0028), so a future candidate is one table entry, `ingest reembed` and `eval golden` on the eval index. A new candidate's top ten must be pooled and judged first, as in step 2, or the comparison favours e5-small.
- Golden set v2 and its baseline replace v1; v1 scores no longer compare.
- The live index and image stay as they are: no rebuild, no new baseline beyond v2, no image or cold-start change.
