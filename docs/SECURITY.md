# Security

[← Docs index](README.md) · [Main README](../README.md)

## Reporting a vulnerability

Please report vulnerabilities privately through [GitHub security advisories](https://github.com/sami3ullah/scholarly_mcp/security/advisories/new), not in a public issue. Expect an answer within a week. Only the latest release and `main` get fixes.

scholarly-mcp is an independent prototype, not affiliated with Thieme or any other publisher.

## What there is to protect

| Asset                | Why it matters                                                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| What readers ask     | A clinician may type patient details into a question. Query text must never be stored or leave the process.                                           |
| Licensed content     | Abstracts and CC BY-NC-ND full text may be used for matching but not redistributed ([ADR 0003](adr/0003-cc-by-nc-nd-full-text-for-matching-only.md)). |
| API keys and secrets | Keys meter and rate-limit callers; the landing API secret and webhook secret guard internal endpoints.                                                |
| Usage records        | Feed billing, so they must be complete and not forgeable.                                                                                             |
| The service itself   | One caller must not starve the others.                                                                                                                |

## Controls

### Privacy

- **No query text anywhere outside the request.** Not in landing URLs (a random 128-bit token stands for the results, [ADR 0017](adr/0017-random-landing-tokens.md)), not in landing sessions (their schema has no field for it), not in usage events, metrics labels or traces, and not in logs: the logger redacts query and secret fields ([ADR 0019](adr/0019-logger-package-and-core-boundaries.md)).
- **Landing sessions expire after 24 h** and are swept. An unknown or expired token falls back to the article page.

### Content

- **Cards only.** Every tool returns title, journal, year, a teaser of at most 280 characters and a link; never full text or whole abstracts ([ADR 0016](adr/0016-teaser-and-link-only.md)).
- **Full text is for matching only.** Its chunks are searched but never returned, and a test fails if any tool response contains full-text words or its source reference. Only licences on `FULLTEXT_LICENSE_ALLOWLIST` are indexed; `ingest purge-license` removes a licence's text on request.
- **Public images carry only the demo index** of CC BY 4.0 articles, checked licence by licence before it is published ([ADR 0039](adr/0039-demo-index-from-a-cc-by-doi-list.md)). The full index is never published.
- **Official APIs only** (Crossref, Europe PMC); no scraping.

### The HTTP edge

- **Authentication** by API key (`smk_…`, stored as a SHA-256 hash and compared in constant time) or OAuth 2.1 access tokens checked against the issuer's JWKS, asymmetric signatures only ([ADR 0031](adr/0031-auth-limits-metering-and-telemetry.md)). `AUTH_MODE=none` is refused beyond loopback; the image defaults to API keys.
- **DNS rebinding:** `/mcp` and the landing API accept only `Host` values on `HTTP_ALLOWED_HOSTS`, and `/mcp` only browser `Origin`s on its allowlist. No route sends CORS headers.
- **Rate limits** per caller (token buckets, shared across replicas on Postgres, [ADR 0036](adr/0036-shared-rate-limit-buckets.md)) and per landing visitor.
- **Limits on every request:** 64 KB bodies, 16 KB of headers, 10 s to send headers, 60 s per request; all tool inputs are parsed with zod schemas, strict about unknown fields.
- **Internal endpoints on internal ports:** `/metrics` and the landing API have their own listeners and answer 404 on the public port; the landing API also needs its secret ([ADR 0037](adr/0037-container-image-and-compose-profiles.md), [ADR 0038](adr/0038-landing-image-proxy-and-secret-files.md)).
- **Errors** carry a stable code and a short message, never a stack trace.
- **Fuzzed:** property tests send arbitrary methods, paths, headers, bodies, JSON-RPC messages and tool arguments, and require a 4xx or a well-formed result every time, with no full text in any answer (`apps/server/src/http/http-edge.fuzz.test.ts`).

### Usage records

- Each event has a unique id and is written to an outbox before it is exported, so a crash loses nothing and a retry duplicates nothing downstream.
- Webhook batches are signed with HMAC-SHA256 over `<timestamp>.<body>` (`x-scholarly-signature`); receivers check the signature in constant time and refuse old timestamps ([operating guide](guides/operating-the-server.md#verifying-webhook-requests)).

### Containers

- Distroless Node 24 base images, uid 65532, read-only root filesystem, no shell or package manager in the image.
- The server needs no network to start: the embedding model is in the image.
- Secrets can come from mounted files (`<NAME>_FILE`), so they need not be in the environment.
- In compose, the landing app sits on internal networks with no route out; only its proxy and the MCP port are published, on loopback. The proxy replaces any client `X-Forwarded-For`, so a visitor cannot pick a rate-limit bucket.

### Supply chain

| Check                                                                            | Where                                    |
| -------------------------------------------------------------------------------- | ---------------------------------------- |
| osv-scanner on `pnpm-lock.yaml`                                                  | `security.yml`, every push and weekly    |
| Trivy on both images and the Dockerfiles                                         | `security.yml`                           |
| Semgrep (`p/default`, `p/typescript`)                                            | `security.yml`                           |
| gitleaks over the whole git history                                              | `security.yml`                           |
| SPDX SBOM per image                                                              | `security.yml`; attached to each release |
| Build provenance attestation                                                     | `release.yml`                            |
| Actions pinned by commit, tools by digest                                        | all workflows                            |
| New npm releases wait 7 days; no trust downgrades; registry-only transitive deps | `pnpm-workspace.yaml`                    |
| Dependabot for npm, actions and base images, 7-day cooldown                      | `.github/dependabot.yml`                 |

Advisories that only touch development tools are ignored in `osv-scanner.toml`, each with its reason and an expiry date. Verify a release image with `gh attestation verify oci://ghcr.io/sami3ullah/scholarly-mcp:<version> --owner sami3ullah`.

## Known limits

- **API keys are bearer secrets.** Anyone holding one can call the tools as that key until it is revoked (`keys revoke`). Use OAuth for anything beyond a pilot.
- **The landing page is reachable by anyone with a link.** A token shows only what the search returned (public metadata and teasers), for 24 h.
- **The mock `Entitlements`** decides access from open access status and the caller's institution only. A deployment replaces it with the publisher's entitlement service ([adapters](ADAPTERS.md#your-own-access-rules)).
- **TLS** ends at the platform's proxy or the compose Caddy; the containers speak plain HTTP on internal networks.
