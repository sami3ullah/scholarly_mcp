# SM-15 Demo, self-hosting guide, recording, outreach (Phases 7-8)

## Owner decisions (2026-11-03)

- **No hosted demo.** The owner runs the demo locally; Thieme gets a guide to host it themselves. This replaces the plan's "host in the EU with HTTPS" and its "public URL stable for 7 days" exit.
- **Self-hosting target:** Docker Compose, hassle-free, deployable on AWS, Cloudflare or similar, and easy to adopt with an existing Postgres database.
- **Keys:** the guide shows how to issue one API key per user or team, revoke one, and read per-key metering.
- **Demo index:** the full Thieme index (70,989 articles), local only, so the paywalled and retraction questions work. Not published.
- **Specialties:** the agent picks them from the index (strong DE and EN coverage, a paywalled hit, a retraction) and proposes 5 questions for approval.
- **Repo:** stays at `github.com/sami3ullah/scholarly_mcp` (public); images at `ghcr.io/sami3ullah/scholarly-mcp`.

## Tasks

- [ ] 5 demo questions (DE, EN, cross-language, paywalled, retraction), proposed and approved
- [ ] Self-hosting guide: Compose deployment with TLS, SQLite or Postgres (bundled or existing, with pgvector and pg_trgm), per-user keys, index build and refresh
- [ ] Deployment notes for AWS and Cloudflare (and the general VM case)
- [ ] Connector instructions for Claude and ChatGPT
- [ ] One-page memo (agent can draft); Loom recording (user)
- [ ] Outreach (user)

## Exit

A clean machine reaches a working deployment by following the guide alone (SQLite, and Postgres against an existing database); video under 5 minutes; outreach sent.
