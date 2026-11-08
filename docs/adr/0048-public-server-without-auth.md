# 0048 Public server without auth

- Status: accepted
- Date: 2026-11-08
- Records: SM-15 (owner decision); supersedes ADR 0047 and the auth parts of ADR 0031 (decision 1, auth modes; API keys); amends ADR 0025 (the local caller), ADR 0033 and ADR 0035 (per-key funnel rows and filters), ADR 0045 (keys in the bundle)

## Context

The server only hands out discovery data: Crossref metadata, a teaser of at most 280 characters, and links that open the publisher's own pages (thieme-connect), where access is decided. Nothing it returns needs protecting behind a login. ADR 0031 still required an API key or an OAuth token for HTTP beyond loopback, and ADR 0047 added a mode accepting both. That costs reach: ChatGPT cannot send a fixed key, most claude.ai organisations cannot either, and OAuth needs an identity provider the demo does not have. The owner decided the server is public: anyone can connect without a key, and the key and OAuth code goes, to keep the service simple. Rate limiting stays if it is cheap.

## Decision

1. **`/mcp` is public.** No credential is read, required or checked; an `Authorization` header is ignored. `AUTH_MODE`, `AUTH_CACHE_MS`, `OAUTH_*`, the API key verifier, the JWT verifier, the Protected Resource Metadata route, the `keys` command, the `ApiKeyStore` port and both store adapters, the `auth_failures_total` metric and the `UNAUTHORIZED` error code are removed. The `Host` allowlist, the `Origin` check, body, header and URL limits, and the closed CORS stay.
2. **No caller identity is recorded.** `Caller` and `apiKeyId` leave the domain: usage events, landing sessions and the funnel carry no key id, and the funnel's per-client table and `--key` filter go. Runtime migrations 6 (SQLite) and 5 (Postgres) drop `api_keys` and the `api_key_id` columns. Old JSON lines that still carry `apiKeyId` parse as before; the field is ignored.
3. **Entitlements depend on the article alone.** `Entitlements.check` takes the DOI and the open access flag. The mock answers `open` or `subscription`; `institution` stays in the access status for a publisher adapter that can recognise a reader's institution by other means.
4. **Rate limits per client address.** Each client address has a token bucket of `RATE_LIMIT_PER_MINUTE` tool calls (default 60, bursts of `RATE_LIMIT_BURST`, default 20), in the same bucket store as before (memory on SQLite, Postgres for replicas, ADR 0036). The bucket key is `client:` plus an HMAC-SHA-256 of the address under a 32-byte secret created at start and held only in memory, so no address, and nothing that could be matched back to one after a restart, is stored or logged. IPv6 clients are grouped by their /64. Stdio has one local bucket.
5. **The client address comes from the socket, or from trusted proxies.** `serveHttp` resolves the address and hands it to the handler in an internal header that it always overwrites, so a client cannot set it. With `HTTP_TRUSTED_PROXIES` (addresses or CIDR ranges) and a trusted peer, the address is the right-most `X-Forwarded-For` hop that is not itself trusted; hops to its left could have been written by the client. The bundle trusts the private ranges, as only Caddy reaches the server.

## Consequences

- Any MCP client connects with the URL alone: Claude Code, Claude Desktop, claude.ai and ChatGPT custom connectors with "no auth", MCP Inspector.
- Usage can no longer be attributed to a customer or partner; the funnel counts all traffic together, by journal, tool, action and day. A publisher that later needs attribution or institution-specific answers adds it back with a new ADR (an identity provider in front, or institutional IP ranges in its entitlements adapter).
- One client address shares one bucket, so many readers behind one NAT share 60 calls a minute; operators raise the limit for such deployments. Clients spread over many addresses are not limited as a whole; a CDN or WAF in front (Cloudflare) is the place for that.
- With several replicas each process has its own HMAC secret, so a client's calls to different replicas fill different buckets: the effective limit is up to one bucket per replica.
- The load test lifts the limit, as all its calls come from one address.

## Alternatives considered

- **Keep optional API keys for partners.** Rejected by the owner for simplicity; nothing in the current product needs attribution.
- **Keep OAuth for institution logins.** Rejected: no identity provider in scope, and access is decided on the publisher's site behind every link.
- **Rate limit by hashed address in usage events too.** Rejected: a stable pseudonymous id per reader is personal data the funnel does not need.
- **A shared HMAC secret from config, so replicas share buckets.** Rejected for now: one more secret to manage for a minor gain; revisit when running several replicas.
