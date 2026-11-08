# Evaluating search

[← Back to the docs index](../README.md)

How search quality is measured, and how to check that a ranking change does not make it worse. Decisions and numbers are in [ADR 0026](../adr/0026-golden-set-eval-and-tuning.md). You need a built live index ([ingestion guide](ingestion.md)) and the embedding model in `.cache/models`.

## The golden set

`packages/testkit/golden/golden-set.json` (version 2) holds 60 queries: 20 German, 20 English and 20 cross-language, abbreviation or compound queries. Each has its information need and graded judgments: `2` mainly about the need, `1` partially relevant. Judgments were made from title and abstract only, over candidates pooled from several retrieval runs; the rubric is in the file. Results nobody judged count as not relevant.

Scores, over the first page of ten:

| Metric    | Meaning                                                                |
| --------- | ---------------------------------------------------------------------- |
| recall@10 | Relevant articles in the top ten, over all relevant ones capped at ten |
| MRR       | One over the rank of the first relevant article in the top ten, else 0 |
| nDCG@10   | Rank-weighted gain (2^grade − 1) against the best possible order       |

## Scores on the live index

```bash
source ~/.nvm/nvm.sh && nvm use
LOG_LEVEL=warn EMBEDDER_CACHE_DIR=.cache/models pnpm eval golden --show
```

`--show` lists each query worst first, with its recall, reciprocal rank and nDCG, and the grade of each of its top ten results (`2`, `1`, or `.` for not relevant). The exit code is `1` while recall is below the targets (`--min-recall`, default 0.8 overall, and `--min-cross-recall`, default 0.7 cross-language). The live index changes with every ingest run, so its scores move a little over time.

## The regression gate

Ranking changes are checked on a fixed eval index, built from the articles listed in `packages/testkit/golden/corpus-dois.txt`, against `packages/testkit/golden/baseline.json`. The index is not committed because it holds article text (ADR 0026), so build it once from your live index:

```bash
pnpm build
EMBEDDER_CACHE_DIR=.cache/models node --env-file=presets/thieme.env apps/ingest/dist/main.js \
  subset --from data/index.sqlite --dois packages/testkit/golden/corpus-dois.txt --out data/eval-index.sqlite
```

Then, before committing a change to search, ranking or text matching:

```bash
INDEX_PATH=data/eval-index.sqlite LOG_LEVEL=warn EMBEDDER_CACHE_DIR=.cache/models \
  pnpm eval golden --baseline packages/testkit/golden/baseline.json
```

| Exit | Meaning                                                                                 |
| ---- | --------------------------------------------------------------------------------------- |
| 0    | No score dropped                                                                        |
| 1    | A score dropped; each one is printed on stderr as `Regression: <scope> <metric> a -> b` |
| 2    | The baseline was made on another eval index or golden set version                       |

When a change improves scores, or lowers one on purpose, record the new scores in the same commit and say why in its message:

```bash
INDEX_PATH=data/eval-index.sqlite LOG_LEVEL=warn EMBEDDER_CACHE_DIR=.cache/models \
  pnpm eval golden --write-baseline packages/testkit/golden/baseline.json
```

GitHub CI does not run the gate, since it has no index. The `pre-push` hook runs it instead when a push touches ranking code (ADR 0030); `SKIP_EVAL_GATE=1 git push` skips it once.

## Comparing embedding models

The model is a setting (`EMBEDDER_MODEL`, [ADR 0028](../adr/0028-selectable-embedding-model.md)). To score another model on the same text, embed a copy of the eval index with it, chunking unchanged:

```bash
EMBEDDER_MODEL=bge-m3 EMBEDDER_CACHE_DIR=.cache/models node --env-file=presets/thieme.env \
  apps/ingest/dist/main.js reembed --from data/eval-index.sqlite --out data/eval-index-bge-m3.sqlite
INDEX_PATH=data/eval-index-bge-m3.sqlite EMBEDDER_MODEL=bge-m3 LOG_LEVEL=warn EMBEDDER_CACHE_DIR=.cache/models \
  pnpm eval golden --rankings data/rankings-bge-m3.json
```

The golden set was pooled from earlier runs, so a new model's results nobody judged count against it. Before comparing, judge its top ten (from `--rankings`) that are neither graded nor in the current model's top ten, as a new golden set version (below). [ADR 0029](../adr/0029-keep-e5-small-after-model-comparison.md) did this for e5-base and bge-m3.

## Changing the golden set

Adding queries or judgments is a new version: bump `version` in the golden set, pool candidates for the new queries from several runs (pipeline, lexical only, vector only, a search for the need in English), judge them blind with the rubric, add any new articles to `corpus-dois.txt`, rebuild the eval index and write a new baseline. Scores of different versions do not compare.
