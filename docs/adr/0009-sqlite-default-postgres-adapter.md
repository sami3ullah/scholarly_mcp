# 0009 SQLite by default, Postgres adapter for production

- Status: accepted
- Date: 2026-11-02
- Records: PLAN.md key design decision #4

## Context

A trial must run with `docker run` and no database. Production at a publisher usually means a managed Postgres.

## Decision

Two store adapters behind the same ports: SQLite (FTS5, trigram FTS, sqlite-vec) as the default, Postgres (tsvector, pgvector with HNSW) for production. Both must pass the same contract suite from `packages/testkit`.

## Consequences

- Zero-setup trial and a standard production path, with no store-specific code above the ports.
- sqlite-vec is pre-1.0; the port and the Postgres path limit that risk.
- Revisit when the corpus grows past about 1M chunks.
