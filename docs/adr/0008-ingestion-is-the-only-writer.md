# 0008 Ingestion is the only writer; the server reads only

- Status: accepted
- Date: 2026-11-02
- Records: PLAN.md key design decision #3

## Context

SQLite allows one writer at a time, and a stateless server scales horizontally only if it holds no state.

## Decision

Apply a read/write split (CQRS). The ingestion worker is the only writer of the article index; the server opens it read-only. Core reflects this with separate `ArticleReader` and `ArticleWriter` ports, so the server's composition root never receives a writer.

Landing sessions and usage events are written by the server, but they live behind their own ports (`SessionStore`, `Meter`) and never touch the article index.

## Consequences

- No write contention on the index; servers can be added freely.
- Index updates happen by building a new index and swapping it in (decision #4).
- Revisit when live per-user data is needed in search.
