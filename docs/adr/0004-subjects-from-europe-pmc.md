# 0004 Derive subjects from Europe PMC, with a journal-level fallback

- Status: accepted (owner decision, 2026-11-02)
- Fills a gap in: PLAN.md data model (`Article.subjects`)

## Context

The plan uses subjects for `get_journal`, the landing page topic label (which must name the topic without using query text) and indexing. Phase 0 found that Crossref has **no** subjects for any sampled Thieme record.

## Decision

Subjects come from, in order:

1. **Europe PMC** article metadata, matched by DOI: MeSH headings (descriptor names only) and author keywords.
2. **Journal-level subjects** from a small curated preset (`presets/thieme.subjects.json`), keyed by ISSN, when Europe PMC has nothing.

Guardrails:

- Only short subject labels are stored, never abstract or full-text content from Europe PMC metadata calls.
- Each subject records its origin (`mesh`, `keyword`, `journal`) so it can be filtered or removed.
- MeSH is produced by the U.S. National Library of Medicine and is free to use; it is used as labels only, unaltered.
- Official REST API only, within its published usage guidance (rate-limited client).

## Consequences

- Articles not in Europe PMC (many German-language ones) get journal-level subjects only, which are coarser.
- One more API call per article during ingestion; done in batches with the same retry and checkpoint rules as Crossref.
