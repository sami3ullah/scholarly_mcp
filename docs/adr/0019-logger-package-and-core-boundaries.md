# 0019 Logger package, logging port and core's ambient types

- Status: accepted
- Date: 2026-11-02
- Fills a gap in: PLAN.md "Repository and layering" (no home for the pino logger)

## Context

The plan asks for a pino logger factory with redaction, used by both `apps/ingest` and `apps/server`. Core may import only zod, so pino cannot live there, and copying the factory into each app would duplicate the redaction rules. Core code (services) also needs to log, and its ports take an `AbortSignal`, a global type that core's tsconfig did not include.

## Decision

1. Core defines a `Logger` port: a pino-compatible subset (`debug`, `info`, `warn`, `error`, `child`).
2. A new package, `packages/logger`, holds `createLogger` (pino) and `loggingConfigSchema` (`LOG_LEVEL`). It may import core only; a dependency-cruiser rule enforces this. Its coverage counts towards the core coverage gate.
3. Redaction is by field name, at the top level and one level down: `query`, `q`, `text`, `authorization`, `cookie`, `apiKey`, `token`, `secret`, `password`, plus request auth headers. Values become `[redacted]`.
4. Core's tsconfig loads `@types/node` for global types such as `AbortSignal`. Importing Node built-ins stays forbidden by dependency-cruiser, so this adds types, not I/O.
5. Ingestion checkpoints get their own small `SyncStateStore` port (interface segregation) instead of joining `ArticleWriter`.

## Consequences

- One place for redaction rules; both apps get the same guarantees.
- Redaction is name-based, so code must keep query text in a field with one of these names, and deeper nesting is not covered. Logging the query at all is still forbidden; redaction is the safety net.
