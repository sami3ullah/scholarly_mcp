# Loom script (under 5 minutes)

Recording checklist and talking points for the SM-15 video. The five demo questions were approved on 2026-11-03 ([ticket](../../tickets/SM-15-demo-outreach.md#demo-questions-approved-2026-11-03)).

## Before recording

1. Full index running locally: `docker compose --profile sqlite --profile landing up -d --wait` with the full `data/index.sqlite` baked in (`INDEX_DIR`, [docker README](../../docker/README.md#build)), or the dev server against `data/index.sqlite`.
2. A key: `docker compose run --rm server keys create --label loom`.
3. Claude Desktop or Claude Code connected ([connectors](../CONNECTORS.md)); start a new chat; check that the six tools are on.
4. A browser tab ready for the landing page (`http://localhost:3000`).
5. Do one dry run of every question; the answers vary a little between runs.

## Script

| Time      | Show                                                                                                                          | Say (in short)                                                                                                         |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 0:00-0:30 | Ask question 1: _"Wann ist eine Helicobacter-pylori-Eradikation sinnvoll, und senkt sie das Magenkrebsrisiko?"_ Click a card. | A German clinical question returns Thieme articles; the click lands on a page built for this search, on Thieme's site. |
| 0:30-1:15 | The landing page: the article, the other matches, access options.                                                             | Doctors ask assistants now. Elsevier, Wiley, Springer Nature are already there. The reader stays on Thieme's site.     |
| 1:15-1:45 | Question 3: _"Finde englischsprachige Studien zur Darmvorbereitung vor der Koloskopie."_                                      | German in, English Endoscopy papers out, matched by meaning.                                                           |
| 1:45-2:15 | Question 2, then 4: _"Can I read the Endoscopy 2026 cold vs hot snare study in full?"_                                        | Paywalled: the assistant gets a teaser and the subscription, login and purchase links, never the article.              |
| 2:15-2:30 | Question 5: _"Can I cite 10.1055/a-2458-7088 for a talk on lung adenocarcinoma?"_                                             | Retracted papers are left out of search and flagged when asked about.                                                  |
| 2:30-3:30 | The README architecture diagram, then `docs/SELF-HOSTING.md`.                                                                 | One container; adapters for Thieme's content API, entitlements, Postgres; self-hosted on a VM, AWS or Cloudflare.      |
| 3:30-4:15 | The funnel report (`funnel --store --out funnel.html`).                                                                       | Every search, card and visit is counted per key, without storing the question: usage-based billing, institutions.      |
| 4:15-4:45 | Back to the chat.                                                                                                             | What production needs (Thieme's content API, entitlements, a pilot), and the ask: 15 minutes of feedback.              |

Keep it under 5 minutes; cut the funnel part first if it runs long.
