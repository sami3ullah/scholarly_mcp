# 0005 Use the Crossref public pool (no mailto) for now

- Status: accepted (owner decision, 2026-11-02)
- Affects: ARCHITECTURE.md edge case "Crossref 429, 5xx or timeouts" (polite pool with a `mailto`)

## Context

The Crossref polite pool needs a contact email. No address has been chosen for the project yet.

## Decision

Use the public pool. `CROSSREF_MAILTO` is an optional config value: when set, the client adds it to the User-Agent and `mailto` parameter and joins the polite pool; when unset, it uses the public pool. The client honours `Retry-After` and Crossref's rate-limit headers in both cases.

## Consequences

- Slower, less predictable full ingestion of ~71k records, and more 429 responses. Incremental syncs are small, so the impact is mostly on the first full run.
- Listed as a limitation in the README. Setting one environment variable removes it.
