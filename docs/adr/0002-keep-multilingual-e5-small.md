# 0002 Keep multilingual-e5-small after the Phase 0 spike

- Status: accepted
- Date: 2026-11-02
- Confirms: PLAN.md key design decision #5

## Context
Phase 0 had to show the model matches German queries to English abstracts and runs in Node inside Docker on amd64 and arm64. Results are in `docs/spike-results.md`: 10/10 top-1 everywhere, 3-25 ms per query, sqlite-vec loads on both architectures.

## Decision
Keep multilingual-e5-small (q8 ONNX via transformers.js). Revisit only if the SM-08 golden set misses its targets; the fallback is bge-m3.

## Consequences
The model is baked into the image so cold start doesn't download it.
