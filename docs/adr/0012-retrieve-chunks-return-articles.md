# 0012 Retrieve chunks, return articles

- Status: accepted
- Date: 2026-11-02
- Records: ARCHITECTURE.md key design decision 7

## Context

Matching on whole articles is imprecise; showing several chunks of the same paper wastes the short result list.

## Decision

Retrieval works on chunks; results are collapsed to one card per DOI, keeping the best chunk as the reason it matched. Full-text chunks can win a match but are never shown (ADR 0003): only their section name appears.

## Consequences

- Precise matching with one result per paper.
- Chunks carry their DOI, origin, source and licence, which the collapse step and the display guardrail use.
