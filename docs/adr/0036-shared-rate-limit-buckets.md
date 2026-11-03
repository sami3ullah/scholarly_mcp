# 0036 Shared rate-limit buckets

- Status: accepted
- Date: 2026-11-03
- Records: SM-14; follows up ADR 0031 (per-key limit) and ADR 0032 (per-visitor landing limit); builds on ADR 0034 (Postgres store)

## Context

ADR 0031 gave every caller a token bucket in the server process's memory, and ADR 0032 did the same for landing visitors. With several replicas behind a load balancer, each one allows the full rate, so a key gets N times its limit. Sessions and events already moved to Postgres for replicas (ADR 0034); the buckets are the last per-process state that changes what a caller sees.

## Decision

1. **A port.** `RateBucketStore` in core: `take(id, policy, now)` takes one token as one atomic step and answers allowed, or refused with `retryAfterSeconds`; `sweep(prefix, before)` forgets idle buckets. The bucket maths (`takeToken`, `retryAfterSeconds`, `refillMs`) moved from the server to core, so both adapters share one definition, and a testkit contract checks both: burst, refill, cap, refused calls not counted, a clock going backwards, prefixes, and 20 concurrent takes allowing exactly the burst.
2. **Two adapters, picked by `STORE`.** SQLite deployments run one process, so buckets stay in memory (least recently used forgotten beyond 10,000, as before). With `STORE=postgres`, buckets live in `scholarly.rate_buckets`, shared by every replica. No separate setting: Postgres is the multi-replica store, as for sessions.
3. **One statement per take.** An `INSERT … ON CONFLICT DO UPDATE` refills, takes and records whether the call was allowed, with every expression reading the locked row as it was. One round trip, no transaction, and correct under concurrency. The caller's clock is passed in; `updated_at` never moves backwards.
4. **Unlogged table.** Runtime migration 4 creates it `UNLOGGED`: no WAL traffic per tool call, and a crash only empties it, which refills every bucket. The server role gets read and write on it.
5. **Namespaced limiters.** One store holds both limits; each limiter prefixes its ids (`tools:`, `landing:`) and sweeps its own buckets once a minute, those idle longer than a full refill (`burst / perMinute`), which are full again anyway.
6. **Fail open.** If the store cannot answer, the call is allowed and a warning is logged. The limit protects capacity, not access: API keys still decide who gets in, and a Postgres outage fails the call's own search anyway.

## Consequences

- **One more query per tool call** on Postgres, under a millisecond on a local network; landing requests pay it too.
- **Ids stay pseudonymous.** Rows hold API key ids and the landing app's salted visitor hash (ADR 0032), never addresses or query text, and are deleted once idle.
- **Clock skew.** Replicas pass their own clocks. NTP-level skew of a few milliseconds changes the refill by a fraction of a token; the `greatest()` guard stops a slow clock from undoing another replica's count.
- **Schema.** Servers on Postgres refuse to start until `ingest migrate` has applied migration 4 and re-granted the server role.
