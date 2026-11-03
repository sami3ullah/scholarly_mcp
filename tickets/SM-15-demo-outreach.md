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
- [ ] Self-hosting guide: Compose deployment with TLS, SQLite or Postgres (bundled or existing, with pgvector and pg_trgm), per-user keys, index build and refresh
- [ ] Deployment notes for AWS and Cloudflare (and the general VM case)
- [ ] Connector instructions for Claude and ChatGPT
- [ ] One-page memo (agent can draft); Loom recording (user)
- [ ] Outreach (user)

## Exit

A clean machine reaches a working deployment by following the guide alone (SQLite, and Postgres against an existing database); video under 5 minutes; outreach sent.
