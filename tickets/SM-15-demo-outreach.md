# SM-15 Demo, self-hosting guide, recording, outreach (Phases 7-8)

## Owner decisions (2026-11-03)

- **No hosted demo.** The owner runs the demo locally; Thieme gets a guide to host it themselves. This replaces the plan's "host in the EU with HTTPS" and its "public URL stable for 7 days" exit.
- **Self-hosting target:** Docker Compose, hassle-free, deployable on AWS, Cloudflare or similar, and easy to adopt with an existing Postgres database.
- **Keys:** the guide shows how to issue one API key per user or team, revoke one, and read per-key metering.
- **Demo index:** the full Thieme index (70,989 articles), local only, so the paywalled and retraction questions work. Not published.
- **Specialties:** the agent picks them from the index (strong DE and EN coverage, a paywalled hit, a retraction) and proposes 5 questions for approval.
- **Repo:** stays at `github.com/sami3ullah/scholarly_mcp` (public); images at `ghcr.io/sami3ullah/scholarly-mcp`.

## Demo questions (approved 2026-11-03)

Specialty: gastroenterology (Zeitschrift für Gastroenterologie 2,870 German articles, Endoscopy 5,856 English). Checked against the full index through the real tools.

1. **German:** "Wann ist eine Helicobacter-pylori-Eradikation sinnvoll, und senkt sie das Magenkrebsrisiko?" (Z Gastroenterol, DMW, Endo-Praxis 2025-26).
2. **English:** "What does recent evidence say about cold vs hot snare polypectomy for small colorectal polyps?" (Endoscopy 2026 trials, open and paywalled mixed).
3. **Cross-language:** "Finde englischsprachige Studien zur Darmvorbereitung vor der Koloskopie." (English Endoscopy papers, matched by meaning).
4. **Paywalled:** follow-up to 2, "Can I read the Endoscopy 2026 cold vs hot snare study in full?" (`check_access`: subscription, login and purchase links; 10.1055/s-0046-1821353).
5. **Retraction:** "Can I cite 10.1055/a-2458-7088 for a talk on lung adenocarcinoma?" (`cite` flags it retracted). The index holds only 4 retractions, none in gastroenterology; German alternative 10.1055/a-2595-1472.

Owner follow-ups from the review: cards show closed articles as `subscription` (ADR 0043); `language: any` returns both languages (ADR 0044).

## Tasks

- [x] 5 demo questions (DE, EN, cross-language, paywalled, retraction), proposed and approved (2026-11-03, below)
- [x] Self-hosting guide: Compose deployment with TLS, SQLite or Postgres (bundled or existing, with pgvector and pg_trgm), per-user keys, index build and refresh (ADR 0045, `deploy/`, `docs/SELF-HOSTING.md`, 2026-11-07)
- [x] Deployment notes for AWS and Cloudflare (and the general VM case) (`docs/SELF-HOSTING.md#where-to-run-it`; Cloudflare Tunnel as a compose profile)
- [x] Connector instructions for Claude and ChatGPT (`docs/CONNECTORS.md`; ChatGPT and most claude.ai organisations need `AUTH_MODE=oauth`)
- [x] One-page memo drafted (`docs/outreach/memo.md`; Loom link and contact to fill in)
- [ ] Release v0.2.0, so the bundle's default `SCHOLARLY_VERSION` exists (owner approval)
- [ ] Clean-machine run of the guide on a real VM with a public hostname, after the release
- [ ] Loom recording (user; script in `docs/outreach/loom-script.md`)
- [ ] Outreach (user)

## Exit

A clean machine reaches a working deployment by following the guide alone (SQLite, and Postgres against an existing database); video under 5 minutes; outreach sent.

## Verification (2026-11-07)

`deploy/` run from a copy holding only `deploy/`, `docker/postgres/init` and `docker/e2e/smoke.mjs`, with images built from `main` and `PUBLIC_HOST=localhost` (Caddy's local CA): all 13 smoke checks pass over HTTPS on SQLite, on the bundled Postgres (after `admin ingest copy`) and on a separate Postgres prepared with the guide's role SQL alone. Tunnel settings (`SITE_ADDRESS=:8080`, loopback bind, trusted private ranges) serve `/readyz` and `/mcp` on plain HTTP. Keys, `funnel --store` and the runtime backup command work through `admin`. Not yet done: Let's Encrypt on a public hostname, published v0.2.0 images, a real Cloudflare tunnel.
