# 0047 API keys and OAuth in one deployment

- Status: accepted
- Date: 2026-11-08
- Records: SM-15; extends ADR 0031 (auth modes) and ADR 0045 (self-hosting bundle)

## Context

ADR 0031 gave a deployment one `AUTH_MODE`: `none`, `api-key` or `oauth`. Clients differ: ChatGPT and most claude.ai organisations reach a connector only through OAuth, while Claude Code, Claude Desktop through `mcp-remote`, MCP Inspector and scripts work best with a fixed key. With one mode, a publisher that wants ChatGPT and claude.ai has to move every key holder (pilot clinics, internal tools, monitoring) to its identity provider, or run two deployments with two hostnames, two runtime databases and two meters. The owner asked the agent to choose.

## Decision

1. **A fourth mode, `AUTH_MODE=api-key+oauth`.** It needs the same `OAUTH_*` settings as `oauth` and accepts a request that carries either an active API key or a JWT access token for this server. `api-key` stays the image default; `oauth` stays for deployments that want the identity provider only.
2. **The token's format picks one verifier.** Every API key matches `smk_key_…`; a JWT starts with its base64url header and can never start with `smk_`. Tokens with the prefix go to the key store only, all others to the JWT check only (`createApiKeyOrJwtVerifier`). Nothing is tried twice, so a refusal comes from the verifier that owns the format, a bad key costs no JWKS fetch, and a JWT never reaches the key store.
3. **A key counts as a grant for this resource.** A key is a credential the operator issued for this one server, so an accepted key is reported with `resource = OAUTH_AUDIENCE` and the scopes in `OAUTH_REQUIRED_SCOPES`. The SDK's resource and scope checks then run unchanged for every request: they pass for keys and apply in full to JWTs.
4. **Discovery stays OAuth's.** Protected Resource Metadata is published and every `401` points to it, as in `oauth` mode. Key clients send their key with the first request and never read the challenge; OAuth clients find the issuer from it.
5. **Callers stay distinct.** Key callers are their key id, OAuth callers `oauth:<client id>`, so rate limits, usage events and landing sessions keep the two apart with no change.

## Consequences

- One hostname serves every client in `docs/CONNECTORS.md`; keys stay available for pilots and automation after OAuth is switched on, and revoking a key still takes effect within `AUTH_CACHE_MS`.
- The key path no longer proves possession of an IdP session, by design: whoever holds an active key is a caller, exactly as in `api-key` mode. Operators who want the identity provider to be the only door keep `AUTH_MODE=oauth`.
- Config refuses `api-key+oauth` without the three `OAUTH_*` settings, with the same messages as `oauth`.

## Alternatives considered

- **Try the key store, then the JWT check, for every token.** Rejected: doubles the work on every refusal, sends keys to the JWKS path and leaks timing differences between the two; the prefix already says which verifier owns a token.
- **Two deployments, one per mode.** Rejected: two hostnames, two databases and two meters for one publisher, and readers would have to know which URL fits their client.
- **Issue our own OAuth tokens for key holders.** Rejected: turns the server into an authorization server, which ADR 0031 kept out of scope.
