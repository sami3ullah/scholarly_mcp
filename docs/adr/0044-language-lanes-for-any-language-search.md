# 0044 Language lanes for "any language" search

- Status: accepted
- Date: 2026-11-03
- Records: SM-15 (owner request: `language: any` returns both languages); amends ADR 0023 (search pipeline) and ADR 0022 (index file layout); golden numbers after ADR 0026 and ADR 0029

## Context

`search_articles` says that "any" (the default) also finds the other language. On the full Thieme index it rarely did. Of the 69 candidates a German question about bowel preparation produced, 3 were English and the first one was at rank 48; the H. pylori question had its first English article at rank 22. The owner asked that `any` return results from both languages.

Why it happened:

- Lexical search matches the query's words, which appear in passages of the query's language.
- multilingual-e5-small (ADR 0029) rates a passage in the query's language closer than the same content in the other language. On the full index the best passage in the other language is 0.03 to 0.065 cosine below the best in the query's language when related articles exist in both, and 0.08 to 0.09 below when the other language has nothing related (chemistry queries).
- So the 50 vector candidates are nearly all in the query's language, and RRF ranks articles found by both sides above articles found by one.

Measured on the golden set (eval index, 2,959 articles; recall@10, MRR, nDCG@10; before: overall 0.680 / 0.888 / 0.627, English 0.873 / 0.950 / 0.807, German 0.566 / 0.824 / 0.489, cross-language 0.600 / 0.892 / 0.585):

| Variant                                                                     | Overall               | English               | Cross-language recall |
| --------------------------------------------------------------------------- | --------------------- | --------------------- | --------------------- |
| Lanes, lexical and vector per lane, results alternating                     | 0.551 / 0.830 / 0.512 | 0.575 / 0.800 / 0.517 | 0.602                 |
| Lanes, all four lists fused with RRF                                        | 0.656 / 0.828 / 0.584 | 0.713 / 0.808 / 0.636 | 0.647                 |
| Same, vector hits within 0.05 of the best of all lanes                      | 0.713 / 0.890 / 0.648 | 0.848 / 0.896 / 0.773 | 0.690                 |
| Same, each lane against its own best (lane dropped beyond 0.04 to 0.1)      | 0.665 to 0.710        | 0.733 to 0.818 recall | 0.657 to 0.685        |
| Similarity floor alone, no lanes                                            | 0.676 to 0.682        | unchanged             | 0.600                 |
| Lanes for the vector side only, one lexical query, floor 0.055, mixed top 5 | 0.710 / 0.900 / 0.646 | 0.868 / 0.950 / 0.809 | 0.655                 |

Strict alternation fills half of every page with the other lane's nearest neighbours, related or not. The floor is what keeps unrelated ones out; without lanes it changes nothing. Margins from 0.05 to 0.055 score best, and 0.06 and up lose 0.02 recall and MRR. A per-lane lexical query costs 34 ms instead of 8 ms when the query's words rarely occur in the lane's language, because the trigram top-up then runs over every passage holding the word and filters the language after, and it only won cross-language recall at the price of English.

Moving the other language's best result into the first five, when it is not there yet, cost 0.01 recall when any result could move. In the first version a word-only match could move: "RadarOpus" (homeopathy software, matched on "Synthesis") jumped into a chiral amine query, a radiotracer "Preparation" paper into a bowel preparation one. Allowing only results related in meaning removed both and cost nothing on the golden set.

## Decision

1. **Two vector lanes.** Without a language filter, the vector side runs once for German passages (`language: 'de'`) and once for all others (the new filter `excludeLanguage: 'de'`, which also keeps passages without a language and the few Portuguese ones), 50 candidates each. A language filter keeps one lane. The lexical side runs once, as before.
2. **A similarity floor.** `VectorChunk` (the vector port's hit) carries the cosine similarity; SQLite derives it from the Euclidean distance of unit vectors, Postgres from `<=>`. Vector hits more than `VECTOR_MARGIN` (0.055) below the best hit of all lanes are dropped before fusion, in every search.
3. **Fusion as before.** The lexical list and every lane's vector list are fused with weighted RRF (lexical weight 1.01, each vector list 1) and collapsed to articles.
4. **Both languages among the first five.** When the first `MIXED_WITHIN` (5, the tool's default page) results all come from the first result's lane, the best result of another lane that is related in meaning (a vector hit above the floor) moves to fifth place; the rest keep their order. A vector hit's lane is the lane that found it; a word-only match among the first five takes the lane of its passage's language, the chunk's own or else the article's. Nothing moves when the other lane has nothing above the floor.
5. **An index on passage language.** `vec_chunks_by_language` lets the German lane read only German rows. It changes no layout, so `INDEX_SCHEMA_VERSION` stays 2: new files get it with the schema, and every build commit adds it to a file that lacks it (`addIndexes`), so a live index picks it up with its next incremental run.

## Consequences

- On the golden set: overall recall 0.710 (was 0.680), MRR 0.900 (0.888), nDCG 0.646 (0.627); German recall 0.606 (0.566); cross-language recall 0.655 (0.600); English 0.868 / 0.950 / 0.809 (0.873 / 0.950 / 0.807). `baseline.json` is rewritten with these numbers.
- On the full index a German question about bowel preparation shows an English Endoscopy paper fifth, and an English chemistry question stays all English, since no German passage comes near.
- The other language still misses the first page when its best passage is more than 0.055 below the query language's best, even if it is related; that is the model's language gap (ADR 0029), and a better multilingual model would close it.
- Cost: one more vector scan per search. With the language index the German scan reads 24% of the rows (10 ms against 31 ms for a full scan of the full index, natively), and the other lane still reads all rows (31 ms). `eval bench` on the full index: p50 64 ms, p95 112 ms (was 51 and 96). Load at 20 calls a second on 2 vCPUs: see `docs/OPERATIONS.md#capacity`. On Postgres, both lanes walk the HNSW index with the language filter applied during the scan (iterative scan, ADR 0034).
- The vector port's hits carry a similarity, so every store adapter must return it; the store contract checks it.
- `find_related` is unchanged: it searches one vector list from the article's mean chunk vector, so its neighbours still lean to the article's own language. The same lanes could serve it later.
