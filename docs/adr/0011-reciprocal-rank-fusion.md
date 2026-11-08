# 0011 Reciprocal Rank Fusion with k = 60

- Status: accepted
- Date: 2026-11-02
- Records: ARCHITECTURE.md key design decision 6

## Context

Search runs a lexical and a vector retrieval in parallel. BM25 and cosine scores live on different scales and cannot be added.

## Decision

Fuse by rank: score = Σ 1 / (60 + rank). Ties break by publication date (newer first), then DOI. The `ArticleSearch` port returns ranks, not raw scores, so adapters cannot leak incomparable scores into fusion.

## Consequences

- Deterministic results with no tuning.
- Revisit when the eval shows a weighted blend wins.
