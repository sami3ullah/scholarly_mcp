# Thieme MCP Server: Engineering Plan
2026-10-29 · @Abdulsamet

## Brief for the implementing agent
Build this plan phase by phase, following the Engineering standards section; when the doc is silent, pick the simplest option that fits those standards and record it as an ADR.
1. Read Overview, High-level architecture, Key design decisions and Engineering standards before writing code.
2. Work through the delivery plan in order. A phase is done only when its exit check passes; tick its tasks in this doc.
3. Keep the repo runnable and CI green after every commit. Small, focused commits.
4. Do not change a key design decision silently: write an ADR in `docs/adr/` explaining why, and flag it in the PR.
5. Hard rules, never broken: official APIs only (Crossref, Europe PMC), no scraping; no article content in chat beyond the teaser; no query text in URLs, logs or the session store; no Thieme logo or branding claims.
6. Handle every edge case listed for the code you touch, with a test for each.
7. When blocked by a missing fact (an API field, a license term), stop and list the question rather than guessing.

## Overview
Build a production-grade MCP server that turns AI assistants into a discovery channel for Thieme. It answers with a short list of relevant Thieme articles, each a link to a personalised landing page on Thieme's site, never the article itself. It ships as one container with a SQLite index for zero-setup trials, plus a Postgres path for production.
**Problem.** Clinicians and researchers increasingly ask AI assistants instead of visiting publisher sites. Elsevier, Wiley and Springer Nature already make their content reachable from these assistants. Thieme, the strongest German-language medical publisher, has no equivalent.
**Goals**
- **Link-first results:** title, journal, year, a teaser of at most 280 characters and a Thieme link per article. No full text or whole abstracts in the chat: the AI gets enough to pick and explain relevance, the reader gets the rest on Thieme's site.
- **Personalised landing:** every click opens a Thieme page built for that search: the chosen article, the other matches, the passage that matched, related reading and access options.
- Cross-language retrieval: a German query finds English papers and the reverse.
- Zero-infrastructure trial: `docker run` with a prebuilt index, no database or API keys to set up.
- Production path: a Postgres store adapter and a source adapter Thieme can point at its own content API.
- Every referral is measurable: UTM tags plus a landing token tie each visit to the search that produced it.
**Non-goals**
- Generating answers or clinical advice. The server returns article cards; the AI client writes the reply.
- Showing article content in the chat beyond the teaser.
- Scraping or any unofficial data access.
- Changing thieme-connect.de itself. The landing page is a reference implementation Thieme's web team can rebuild in its own stack.
- Training or fine-tuning models.
**Success criteria**
| Area | Target |
| Retrieval quality | recall@10 ≥ 0.8 on a 60-query golden set; cross-language queries ≥ 0.7 |
| Click-through | share of searches that lead to a landing visit, measured; target above the 5.2% general ChatGPT click-out rate |
| Latency | p95 search under 500 ms on a 2-vCPU container; landing page LCP under 2.5 s |
| Attribution | 100% of results carry DOI, Thieme link and license, enforced by the output schema |
| Trial setup | fresh clone to a working server in under 5 minutes |
| Code quality | strict TypeScript, ≥ 85% line coverage on core packages, CI green |
Demo corpus: Crossref lists 71,435 Thieme journal articles published since 2024, of which 26,328 include an abstract.

## Impact: revenue and visibility
The value of this design is traffic Thieme owns: in the base case about 41,000 extra visits a month to Thieme pages (+9%), each landing on a page built for that search. Revenue then comes through Thieme's existing paths on the site (subscriptions, article purchases, CME, shop), so it is measured per referred visit. Every input below is a published figure; the assumptions are listed.
**Published figures used**
| Figure | Value | Source |
| Thieme Group revenue, FY2022 (latest public) | €172.7M | [Konzernlagebericht 2022](https://www.lobbyregister.bundestag.de/media/bf/ac/323650/2022-Lagebericht-GTV-Konzern.pdf) |
| Wiley AI licensing, FY2026 (May 2025–Apr 2026) | about $49M of $1,677M revenue = **2.9%** | [Wiley FY2026 results](https://newsroom.wiley.com/press-releases/press-release-details/2026/Research-and-AI-Momentum-Record-Margins-and-Cash-Flow-Growth-Highlight-Wileys-Fourth-Quarter-and-Fiscal-2026-Results/default.aspx) |
| Practising doctors in Germany, end of 2025 | **446,120** | [BÄK Ärztestatistik 2025](https://www.bundesaerztekammer.de/fileadmin/user_upload/BAEK/Ueber_uns/Statistik/AErztestatistik_2025.pdf) |
| AMBOSS, the German market leader: doctors using it | **80,000+** (18% of German doctors) | [BDC, Aug 2026](https://www.bdc.de/leistungen/amboss/) |
| AMBOSS price for doctors | **€198 a year** (€25 monthly; practices €29 per person a month) | [AMBOSS price page](https://www.amboss.com/de/preise-aerztinnen-und-aerzte) |
| OpenEvidence usage intensity | about 27M consultations a month from about 760,000 physicians = **35****.5**** per physician a month** (company-reported) | [FQHC Talent, citing OpenEvidence and NBC News](https://www.fqhctalent.com/blog/openevidence-ai-doctors-fqhc) |
| Click-out rate from AI answers | **5.2%** of ChatGPT sessions lead to an outbound click; clicks skew toward specialised sites | [Shi, Zhu, Gu, arXiv 2026](https://arxiv.org/abs/2607.07652) |
| AI use among DACH doctors (n = 462) | 92% use AI tools; ChatGPT most named (24 of 46 in Germany); OpenEvidence officially not offered in the EU | [FOMF survey, Sep 2026](https://www.presseportal.de/pm/183075/6343289) |
| thieme-connect.de, Sep 2026 | 438,270 visits; about 1.5% from AI platforms (~6,400) | [Semrush](https://www.semrush.com/website/thieme-connect.de/overview/) |
**Revenue: what the referred visits are worth**
Thieme does not publish revenue per visit, so this table shows what each €1 earned per referred visit adds up to. Thieme's analytics team can fill in the real value in minutes.
| Measure | Conservative | Base | Benchmark |
| Doctors reached (share of 446,120) | 4,461 (1%) | 22,306 (5%) | 80,000 (AMBOSS today) |
| Extra visits a year | 98,800 | 494,000 | 1.77M |
| Annual revenue per €1 earned per visit | €0.10M | €0.49M | €1.77M |
For scale: one doctor converted to an annual subscription is worth about €198 a year at AMBOSS's public price. Licensing the search itself to AI companies or institutions stays possible later (AI licensing was 2.9% of Wiley's revenue), but it is not this design's model: here the content stays on Thieme's site.
**Visibility scenarios (per month)**
| Measure | Conservative | Base | Benchmark | How it's calculated |
| AI searches answered with Thieme sources | 158,000 | 792,000 | 2.84M | doctors reached × 35.5 (OpenEvidence intensity) |
| Extra visits to thieme-connect.de | **8,200** | **41,000** | **148,000** | searches × 5.2% click-out |
| Versus today's 438,270 visits | +1.9% | +9.4% | +34% |  |
| Versus today's ~6,400 AI-referred visits | 1.3× | 6.4× | 23× |  |
5.2% is the click-out rate for general ChatGPT answers, which usually answer in full. A link-first design that shows only a teaser should do better; the pilot measures by how much. Each answered search also puts the Thieme name and journal in front of a doctor at the moment of a decision, whether or not they click.
**What remains an assumption**
- Reach: 1% and 5% of German doctors are chosen floors, with AMBOSS's 18% as the observed benchmark.
- Click-through: 5.2% is a floor from general ChatGPT use; the link-first effect is not yet measured anywhere public.
- Revenue per visit: unknown outside Thieme; the table is a multiplier, not a forecast.
- Transfer: OpenEvidence intensity and the click-out rate come from US data.
- Traffic base: Semrush figures are estimates, not Thieme's analytics.
**How the prototype measures it**
- Every link carries a landing token plus `utm_source=mcp` and the tool name, so Thieme's analytics separate this traffic and tie each visit to its search.
- The metering dashboard shows the funnel: searches, cards shown per journal, landing visits, and what visitors did next (read, log in, buy, subscribe), without storing query text.
- A 30-day pilot with one hospital would replace the reach, click-through and revenue-per-visit figures with Thieme's own numbers.

## High-level architecture
Two paths share one index: an offline ingestion worker builds it from content sources, and the online MCP server only reads it. The server returns article cards whose links carry a short-lived token, so the Thieme landing page can rebuild the search's results for that reader. Everything Thieme would swap (sources, store, auth, landing page) sits behind an adapter.
Read it left then right: sources feed ingestion, ingestion writes the index; AI clients call the server, which searches the same index. The dashed box is the one piece Thieme would write.
| Component | Responsibility | Swappable via |
| Source adapters | Fetch records (and open access full text for matching); emit canonical `Article` objects | `Source` port |
| Ingestion worker | Normalise, license-gate, chunk, embed, upsert, verify, swap the index | CLI, run on a schedule |
| Search index | Lexical (FTS5 or tsvector) and vector (sqlite-vec or pgvector) storage | `Store` port |
| Embedder | Turns passages and queries into 384-dimension vectors, in-process | `Embedder` port |
| Search service | Parallel lexical + vector retrieval, filters, RRF fusion, collapse to articles | Core, not swapped |
| Tool layer | Six MCP tools returning article cards with teasers and Thieme links | Core, not swapped |
| Landing sessions | Stores each search's result list under a random token for 24 h; resolves it for the landing page | `SessionStore` port |
| Landing page (reference) | Next.js page that turns a token into a personalised Thieme page: chosen article, other matches, matched passage, access options | Thieme rebuilds it on thieme-connect.de |
| Auth + rate limits | API keys for the demo, OAuth 2.1 for production; per-key quotas (Superseded by ADR 0048: the server is public; rate limits are per client address.) | Config |
| Entitlements | Show open, subscribed or paywalled status on cards and landing page | `Entitlements` port (mock in demo) |
| Metering | Usage and referral events into an outbox, exported for billing and analytics | `Meter` port |
| Telemetry | Structured logs, traces, `/metrics`, health and readiness | Config |

## Key design decisions
The design is ports and adapters: the core knows nothing about Crossref, SQLite or Postgres, so each can be swapped without touching search or the tools.
| # | Decision | Choice | Why | Revisit when |
| 1 | Language | TypeScript on Node 22 LTS, strict mode | Matches the role; official MCP TypeScript SDK; an official Java SDK exists if they port it | Thieme mandates another runtime |
| 2 | Transport | Streamable HTTP for remote use, stdio for local dev | Organisation-wide connectors need HTTP; stdio makes Claude Desktop testing trivial | MCP spec changes transports |
| 3 | Read/write split | Ingestion is the only writer; the server opens the index read-only | Stateless server scales horizontally; no write contention in SQLite (CQRS) | Live per-user data is needed |
| 4 | Index store | SQLite (FTS5 + sqlite-vec) by default; Postgres (tsvector + pgvector) adapter | Zero-setup trial and a standard production path behind one `Store` port | Corpus grows past ~1M chunks |
| 5 | Embeddings | multilingual-e5-small (384 dims), run in-process via ONNX | German + English, no external API or keys, fast on CPU; model version stored per chunk | Golden-set recall below target: try bge-m3 |
| 6 | Rank fusion | Reciprocal Rank Fusion, k = 60 | BM25 and cosine scores are not comparable; RRF needs no tuning and is deterministic | Eval shows a weighted blend wins |
| 7 | Units | Retrieve chunks, return articles | Precise matching, one result per paper with its best passage as snippet | Never |
| 8 | Validation | zod schemas for config, source records, tool input and output | One source of truth; JSON Schema for MCP is generated from it | Never |
| 9 | Config | Environment variables validated at boot; fail fast | 12-factor, container-friendly, no hidden defaults | Never |
| 10 | Naming | Generic `scholarly-mcp` repo with a Thieme preset | Avoids using Thieme's trademark; shows the design works for any Crossref prefix | Thieme adopts it |
| 11 | Content shown in chat | A teaser of at most 280 characters plus a Thieme link; full text used only for matching, under a CC BY allowlist | Keeps readers and content on Thieme's site, where Thieme can personalise, convert and measure | Thieme sets its own policy |
| 12 | Landing links | Random 128-bit token per search, 24 h expiry, no query text in the URL | The landing page can rebuild the results without exposing what a doctor typed in logs, referrers or forwarded links | Thieme wants personalisation tied to logged-in accounts |
| 13 | Result rendering | Plain text with links in every client; an MCP Apps card list where the client supports it | Links survive in any client; cards with a clear “Read on Thieme” button make the click the obvious next step | Client support for MCP Apps changes |

## Data model and search design
One canonical `Article` record feeds both stores; search retrieves chunks lexically and semantically in parallel, fuses them with RRF and returns one result per article.
**Canonical records**
| Entity | Fields |
| Article | `doi` (PK, lowercased, no `https://doi.org/`), title, subtitle, journal (name, print ISSN, electronic ISSN), authors (given, family, ORCID), published date + precision (day, month or year), language, abstract (plain text), subjects, licenses (URL, content version, start date), `isOpenAccess`, `isRetracted`, landing URL, `contentHash`, `sourceUpdatedAt`, `ingestedAt` |
| Chunk | id, `doi` (FK), ordinal, section label, text, language, token count, embedding, `modelVersion` |
| SyncState | source, cursor, last `from-update-date` window, last run status |
| UsageEvent | id (idempotency key), API key id (removed by ADR 0048), tool, result count, latency, status, timestamp, `exportedAt` |
| IndexMeta | index version, model version, article and chunk counts, built at |
| LandingSession | token (random 128-bit, PK), ordered result DOIs with matched chunk ids, chosen language, API key id (removed by ADR 0048), created at, expires at (24 h), visit count. No query text. |
**SQLite store (default)**
- `articles` and `chunks` tables; `chunks_fts` as an FTS5 virtual table with `unicode61 remove_diacritics 2`.
- German stemming done in TypeScript (Snowball) at index and query time, stored in a `text_stemmed` column, because FTS5 has no German stemmer.
- A second FTS5 table with the `trigram` tokenizer for German compounds and partial words.
- `vec_chunks` as a sqlite-vec `vec0` table, `float[384]`; exact scan, about 75 MB for 50k chunks.
- Built into a new file, verified, then atomically renamed into place. The server reopens on the new `IndexMeta.version`.
**Postgres store (production)**
- `tsv` generated column: title weighted A, abstract and body weighted B, using a per-row `regconfig` (`german` or `english`); GIN index.
- `embedding vector(384)` with an HNSW index on `vector_cosine_ops`.
- Read-only role for the server, write role for ingestion; versioned SQL migrations.
**Chunking**
1. Split on structure first: abstract sections (Background, Methods, Results, Conclusion) and full-text sections.
2. Hard limit of 200–400 tokens; sentences are the fallback unit.
3. Overlap the last 1–2 sentences between chunks.
4. Title is prepended to every chunk's embedding text, so short chunks keep their context.
**Query pipeline**
1. Validate: trim, Unicode NFC, strip control characters and soft hyphens, cap at 500 characters.
2. Shortcut: a DOI in the query goes straight to a lookup.
3. Detect language; if uncertain, stem with both German and English.
4. Embed with the `query:` prefix that e5 models require (`passage:` at index time); cache embeddings in an LRU.
5. Run lexical top 50 and vector top 50 in parallel, with the same filters applied to both.
6. Fuse with RRF: score = Σ 1 / (60 + rank); ties broken by publication date, then DOI.
7. Collapse to one result per DOI, keeping the best chunk as the snippet.
8. Hydrate metadata, build each teaser (max 280 characters, cut at a word boundary), attach access status, then store a landing session and put its token in every link.
9. Return with an opaque cursor that encodes offset and index version.

## MCP tool contracts
Six read-only tools that return article cards, never article content: enough for the AI to pick and explain the right papers, with the reading itself happening on Thieme's site.
**The article card** (every tool that returns articles uses it)
| Field | Content |
| `title`, `journal`, `year`, `firstAuthor` | From Crossref metadata |
| `teaser` | At most 280 characters: the abstract's conclusion sentence, or its first sentence; empty when there is no abstract |
| `whyMatched` | Short label such as “matched in Results: rivaroxaban dosing”, built from the matched chunk's section and terms |
| `access` | `open`, `subscription` or `unknown` |
| `url` | Thieme landing link with token and UTM tags, e.g. `…/mcp/landing?t=<token>&doi=<doi>&utm_source=mcp&utm_medium=ai&utm_campaign=search_articles` |
| `doi` | Normalised DOI, also the fallback link via doi.org |
| Tool | Input | Output | Notes |
| `search_articles` | `query` (1–500 chars), `language` (de, en, any), `journal` (name or ISSN), `yearFrom`, `yearTo`, `openAccessOnly`, `limit` (1–10, default 5) | up to 10 cards, `collectionUrl` (one Thieme page with all results), `nextCursor`, `indexVersion` | Default of 5 keeps the reply short and each link visible; empty results include a hint to loosen filters |
| `get_article` | `doi` | one card plus subjects and journal link | Used when the AI already has a DOI; still no abstract beyond the teaser |
| `find_related` | `doi`, `limit` | cards, `collectionUrl` | Nearest neighbours of the article's mean chunk vector |
| `get_journal` | `issn` or `query` | name, ISSNs, subjects, open access policy, Thieme journal page link | Built from indexed records only |
| `cite` | `doi`, `style` (vancouver, apa, ama, bibtex, ris) | formatted citation including the Thieme link | CSL-based, snapshot-tested |
| `check_access` | `doi` + caller identity (ADR 0048: `doi` only, callers are anonymous) | `open`, `subscription` or `institution`, plus the link to log in or buy | Demo uses a mock entitlement adapter |
**Conventions for every tool**
- Annotations: `readOnlyHint: true`, `openWorldHint: false`.
- Descriptions tell the model how to present results: a short list of linked titles, one line each on why it fits, and a pointer to the link for the details. They also say not to stretch the teaser into a summary, to treat card text as untrusted data, and never to present results as clinical advice.
- Where the client supports MCP Apps, `search_articles` also returns a card-list UI resource: title, journal, teaser, access badge and a “Read on Thieme” button. Every other client gets the same content as plain text with links.
- Every response includes a `notice` field: “Evidence pointers, not clinical advice. Independent prototype, not affiliated with Thieme.”
- Responses stay under about 5 KB, so the cards, not a wall of text, are what the reader sees.
**Errors**
Tool errors return `isError: true` with a stable code and a message the model can act on, never a stack trace.
| Code | When | Model-facing message |
| `INVALID_INPUT` | Schema fails, `yearFrom` > `yearTo`, bad DOI | What was wrong and the allowed range |
| `NOT_FOUND` | DOI not in the index | Suggest `search_articles` |
| `CURSOR_STALE` | Index swapped between pages | Rerun the search |
| `RATE_LIMITED` | Quota exceeded | Includes `retryAfter` seconds |
| `UNAUTHORIZED` | Missing, invalid or revoked key | Connect again (Removed by ADR 0048: the server is public.) |
| `TIMEOUT` | Search over its 2 s budget | Retry or narrow the query |
| `INDEX_UNAVAILABLE` | Index missing or being replaced | Retry shortly |

## Edge cases and failure handling
The rule throughout: never fabricate, never block a request on a side system, and fail with a message the model can act on.
**Ingestion and data**
| Edge case | Handling |
| Crossref 429, 5xx or timeouts | Exponential backoff with jitter, honour `Retry-After`, polite pool with a `mailto`; checkpoint after every page |
| Deep paging beyond 10k offset | Cursor paging (`cursor=*`); an expired cursor restarts from the last checkpointed date window |
| Records changed after the first load | Incremental sync on `from-update-date` with a 1-day overlap to absorb clock skew |
| DOI case and prefix variants | Normalise to lowercase, strip `https://doi.org/` and `doi:` before any lookup or write |
| Abstracts in JATS XML (tags, MathML, entities, a leading “Abstract” title) | Sanitise to plain text, keep section labels, decode entities; snapshot tests on real samples |
| Bilingual abstracts, or a German title with an English abstract | Detect language per paragraph and store it per chunk |
| No abstract (about 63% of 2024+ articles) | Index title, journal and subjects only; rank normally; never invent text |
| Missing authors, year-only dates | Optional fields with a stored date precision; citations degrade cleanly |
| Non-article records (errata, editorials, Thieme book chapters also use 10.1055) | Filter to `journal-article`; flag errata by relation and title |
| Retractions and corrections | Read Crossref update relations; exclude retracted articles from search by default, warn in `get_article` |
| Several license entries or a future embargo date | Use the version-of-record license; treat as closed until its start date; unknown license means metadata only |
| Europe PMC has no match or a different version | Match on DOI only; skip full text when missing |
| Soft hyphens, zero-width characters, NFD umlauts | NFC normalisation and stripping before chunking, so German compounds match |
| Unchanged record re-fetched | Compare `contentHash`; skip re-embedding |
| Crash halfway through a run | Batches in transactions, idempotent upserts by DOI; the new index is swapped in only after verification (counts + sample queries) |
| Embedding model changed | Build a full new index; the server refuses to mix model versions |
**Search and queries**
| Edge case | Handling |
| Empty, one-character or only-stopword query (“die der das”) | `INVALID_INPUT` for empty; vector-only search for stopword-only queries |
| FTS syntax in user input (quotes, `AND`, `NEAR`, `*`, `-`, brackets) | Never pass raw input to `MATCH`: tokenise and quote each token; Postgres uses `websearch_to_tsquery` |
| SQL injection | Parameterised queries only, enforced by a lint rule |
| Mixed-language query (“Therapie of atrial fibrillation”) | Semantic search carries it; lexical side stems with both languages |
| Umlaut and ß variants (“Ärzte”, “Aerzte”; “Straße”, “Strasse”) | Folded copy of the text for matching; diacritics removed in FTS |
| German compounds (“Vorhofflimmertherapie”) | Trigram index plus semantic search |
| Abbreviations (“VHF”, “AF”, “COPD”) | Semantic search plus a small, test-covered DE/EN abbreviation map |
| A DOI or full title pasted as the query | DOI pattern goes to direct lookup; exact title match is boosted |
| No results | Empty list with a hint to loosen filters, not an error |
| `yearFrom` after `yearTo`, unknown journal | `INVALID_INPUT` naming the field |
| Index swapped between page 1 and page 2 | Cursor carries the index version; mismatch returns `CURSOR_STALE` |
| Identical RRF scores | Deterministic tie-break: newer first, then DOI |
| Oversized response | Cap results and snippet length; total response about 20 KB |
**Server, protocol and operations**
| Edge case | Handling |
| Unknown tool or malformed arguments | Schema validation error with the allowed values |
| Concurrent requests | Stateless handlers; SQLite opened read-only in WAL mode; Postgres connection pool |
| Cross-site requests to the HTTP endpoint (DNS rebinding) | Validate the `Origin` header as the MCP spec requires; CORS closed |
| Cold start: model loading takes seconds | Load model and open the index at boot; readiness stays false until both succeed |
| Index file missing or corrupt | Readiness fails with a clear log line; no silent crash loop |
| Slow query | 2 s budget per request via `AbortSignal`; return `TIMEOUT` |
| CPU starvation from embedding bursts | Semaphore on concurrent embeddings; queue with a short timeout |
| Abusive client | Per-key token bucket; `RATE_LIMITED` with `retryAfter` (Superseded by ADR 0048: the server is public; rate limits are per client address.) |
| Revoked key or expired token | Auth decisions cached for seconds only (Superseded by ADR 0048: no keys or tokens.) |
| Deploy or scale-down | `SIGTERM` drains in-flight requests and flushes the metering outbox |
**Metering**
| Edge case | Handling |
| Same event sent twice after a retry | Idempotency key per request; the exporter dedupes on it |
| Exporter or billing endpoint down | Events wait in the outbox and retry with backoff; requests are never blocked |
| Failed requests | Recorded, but marked non-billable |
**Content safety**
| Edge case | Handling |
| Prompt injection inside an abstract (“ignore previous instructions”) | Content returned in clearly delimited data fields; control characters stripped; tool descriptions mark it as untrusted |
| Dosing or treatment questions | Server returns evidence plus the notice field; it never generates advice |
| Retracted papers | Excluded by default; flagged when fetched directly |
| Paywalled content | Never full text without an entitlement; snippets come from the abstract only |
| A clinician types patient details into a query | Raw queries are not logged by default (hash and length only) |
**Links and landing pages**
| Edge case | Handling |
| The AI client hides, shortens or rewrites links | Link sits in the card's title and `url`; MCP Apps cards where supported; the funnel (cards shown vs landing visits) shows when a client drops links |
| The model answers from its own knowledge instead of the cards | Teaser stays short; tool description asks for linked titles; this cannot be forced, so it is measured per client |
| Token expired (after 24 h) or unknown | Landing falls back to the plain article page via the DOI; no error page |
| Link forwarded to a colleague | Works for anyone until expiry; the token holds only result DOIs, no personal data or query text |
| Query text would reveal patient details | Never in URLs or the session store; the landing page names the topic from the matched articles' subjects instead |
| Link previews and crawlers (Slack, chat clients prefetching URLs) inflate visits | A visit counts only after a client-side beacon; prefetch user agents are filtered; GET never consumes the token |
| Duplicate pages hurting SEO | Token pages are `noindex` with a canonical link to the article page |
| Paywalled article | Landing shows teaser, abstract, institutional login and purchase options; open access articles open in full |
| Thieme page moved or removed | Link resolves through doi.org as the fallback |
| Tracking parameters stripped by browsers or ad blockers | The token alone still attributes the visit server-side |
| Many results, small phone screen | Landing page is mobile-first: chosen article on top, other matches as a compact list |

## Testing strategy
The test that proves plug-and-play is the shared adapter contract suite: every store and every source must pass the same tests, so swapping one in cannot break search or the tools.
| Layer | What it covers | Tools |
| Unit | DOI normalisation, JATS cleaning, soft-hyphen and umlaut folding, license gate, chunk boundaries and overlap, RRF determinism, cursor encoding, citation output (snapshots) | Vitest |
| Property-based | Any random string as a query never throws an FTS or SQL error; chunker never loses or duplicates text | fast-check |
| Adapter contracts | One suite run against SQLite and Postgres stores, and against Crossref and Europe PMC sources | Vitest + Testcontainers (pgvector image) |
| Integration | Ingestion on recorded Crossref responses with injected 429, 500 and timeouts; resume after a simulated crash; index swap | msw fixtures |
| MCP protocol | In-process server driven by the official SDK client: list tools, call each, validate every output against its schema | MCP SDK client |
| Search quality | 60-query golden set (20 German, 20 English, 20 cross-language, abbreviation or compound); recall@10, MRR, nDCG@10; CI fails on regression | Custom eval script |
| Performance | p50/p95 latency at 20 requests/s, memory ceiling, cold-start time | autocannon or k6 |
| Security | Dependency and image scanning, static analysis, secret scanning | osv-scanner, Trivy, Semgrep, gitleaks |
| End-to-end smoke | `docker compose up`, then call every tool over HTTP with a test key (ADR 0048: no key needed) | Shell script in CI |
| Landing page | Token renders the right articles in the right order; expiry falls back to the article page; noindex and canonical present; beacon fires once; Lighthouse performance and accessibility budgets | Playwright, Lighthouse CI, axe |
**Golden set rule:** only include queries where relevance is clear from title and abstract, since you are not a clinician. Record the expected DOIs once and version the file.
**CI pipeline (GitHub Actions)**
1. Lint and format check (ESLint, Prettier), type check (`tsc --strict`).
2. Unit, property and contract tests with coverage gate (≥ 85% on core packages).
3. Integration tests with Postgres via Testcontainers.
4. Search-quality eval against a small committed index; fail below thresholds.
5. Build the image, scan it, run the smoke test.
6. On a tag: publish the image to GHCR with an SBOM.

## Security, compliance and guardrails
The server is read-only, holds no patient data by design, and only uses official APIs, so the main risks are access control, content rights and model misuse.
| Area | Measure |
| Authentication | API keys stored hashed and identifiable by prefix for the demo; OAuth 2.1 resource-server mode for production, validating tokens from Thieme's identity provider (audience checked) as the MCP authorization spec describes; tokens never passed upstream (Superseded by ADR 0048: the server is public; rate limits are per client address.) |
| Transport | TLS at the load balancer; `Origin` validation; CORS closed; request body and query length limits |
| Least privilege | Read-only database role for the server; separate credentials for ingestion; container runs as non-root on a distroless image with a read-only filesystem |
| Secrets | Environment or secret manager only; redacted in logs |
| Privacy (GDPR) | Raw queries not logged by default; metering stores key id (removed by ADR 0048), tool, counts and latency, never query text; EU hosting for the demo |
| Content rights | Official APIs only (Crossref, Europe PMC); license allowlist for full text; attribution required by schema; “no model training” stated in server metadata |
| Medical safety | No generated advice; notice field on every response; retracted papers excluded; publication date shown so the model can judge recency |
| Prompt injection | Article text returned as delimited data; control characters stripped; tool descriptions mark it untrusted |
| Supply chain | Lockfile, pinned versions, Dependabot, SBOM per release |
| Branding | “Independent prototype, not affiliated with Thieme” in README, server metadata and every response; no Thieme logo |
| Landing tokens | Random 128-bit, 24 h expiry, rate-limited lookup, no query text stored or put in URLs; tokens grant nothing beyond showing public metadata |

## Engineering standards
Simple first: small modules with one job each, dependencies pointing inward to a pure core, and every rule below enforced by tooling where possible, not by memory.

### Principles, made concrete
| Principle | What it means in this repo |
| KISS | The simplest thing that passes the tests. No framework where a function will do; no DI container, no class hierarchies, no generic “utils” layer |
| YAGNI | An abstraction needs a second real use. The only exceptions are the ports listed below, which exist because adapters are swapped by design |
| Single responsibility | One exported concept per file; a file that needs “and” in its description is split |
| Open/closed | New sources, stores or citation styles are added as new adapter files, without editing search or tool code |
| Liskov | Every adapter passes the same contract test suite as its siblings; if it can't, the port is wrong |
| Interface segregation | Small, role-specific ports (`ArticleReader`, `ArticleWriter`) rather than one large `Repository` |
| Dependency inversion | Core defines the ports; adapters implement them; only the composition root (`main.ts`) creates concrete adapters |
| Composition over inheritance | Functions and plain objects composed together; no `extends` outside third-party requirements |
| Functional core, imperative shell | Ranking, fusion, chunking, teasers and citations are pure functions; I/O lives only in adapters and apps |

### Repository and layering
- pnpm workspaces, Node 22 LTS, ESM only, TypeScript 5 with `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Turborepo for cached builds and tests across packages.
- Dependency direction is enforced in CI with dependency-cruiser:
| Layer | May import | Must not import |
| `packages/core` | nothing but zod and the standard library | any adapter, any I/O, Node built-ins like `fs` or `http` |
| `packages/source-*`, `store-*`, `embedder-*` | `core` | other adapters, apps |
| `packages/testkit` | `core` | apps |
| `apps/*` | `core`, adapters, testkit (tests only) | each other |

### Backend conventions
- **Feature folders inside packages**, one concept per file, kebab-case names: `core/src/search/rrf.ts`, `collapse-to-articles.ts`, `build-teaser.ts`. Aim for under ~200 lines per file and ~40 per function.
- **Named exports only**; one `index.ts` barrel per package root, none deeper.
- **Ports are small TypeScript interfaces in core**, for example:
```ts
export interface ArticleSearch {
  lexical(query: LexicalQuery, signal: AbortSignal): Promise<RankedChunk[]>;
  vector(query: VectorQuery, signal: AbortSignal): Promise<RankedChunk[]>;
}

export interface SessionStore {
  save(session: LandingSession): Promise<void>;
  find(token: Token): Promise<LandingSession | undefined>;
}
```
- **Factories, not classes**, for services: `createSearchService({ search, embedder, clock, logger })` returns an object of functions. Dependencies are passed in, never imported, so tests pass fakes.
- **One composition root** per app (`apps/server/src/main.ts`) that reads config, creates adapters and wires services. Nothing else creates concrete adapters.
- **Validate at the edges** with zod (config, HTTP input, source records, tool input and output); inside core, trust the types.
- **Errors:** one `AppError` type with a stable `code`; adapters translate low-level errors into it; the tool layer maps codes to MCP errors in one place. Never swallow an error; never leak a stack trace.
- **Async hygiene:** every I/O call takes an `AbortSignal`; `no-floating-promises` lint rule on.
- **Logging:** pino, structured, with request id; no `console.log`; never log query text or secrets.
- **Time and randomness are dependencies** (`clock`, `randomToken`), so tests are deterministic.
- **Comments explain why, not what.** TSDoc on every exported function and port.

### React and Next.js conventions (landing app)
- Next.js App Router, Server Components by default; `'use client'` only on interactive leaves (beacon, expand teaser, copy citation).
- **Route files stay thin**: `page.tsx` fetches through a server function and renders one feature component. `loading.tsx`, `error.tsx` and `not-found.tsx` for every route.
- **Feature-based structure**, one component per file:
```
apps/landing/src/
  app/mcp/landing/
    page.tsx              thin: resolve token, render <LandingView>
    loading.tsx, error.tsx, not-found.tsx
  features/landing/
    components/
      landing-view.tsx      layout only, composes the parts below
      chosen-article.tsx
      article-card.tsx
      match-list.tsx
      matched-passage.tsx
      access-options.tsx
      related-reading.tsx
    hooks/
      use-referral-beacon.ts
      use-access-status.ts
      use-expandable-teaser.ts
    server/
      get-landing-session.ts   import 'server-only'; calls the token API
    model/
      landing-session.ts      zod schema + types
      build-article-url.ts    pure helpers
  shared/
    ui/       button, badge, skeleton: design-system primitives
    lib/      analytics.ts, env.ts
```
- **Components are presentational**: props in, JSX out, under ~150 lines, no data fetching or business rules inside leaf components.
- **Business logic lives in hooks** (client) or `server/` functions (server). A hook returns state and actions, never JSX, and is tested with `renderHook`:
```ts
export function useReferralBeacon(token: Token, doi: Doi) {
  useEffect(() => {
    sendBeacon({ token, doi });
  }, [token, doi]);
}
```
- **State:** derive, don't duplicate; keep state as close to where it's used as possible; no global store. More than two levels of prop passing means composition (`children`) instead.
- **Lists** keyed by DOI, never by index.
- **Styling:** CSS Modules with design tokens as CSS variables, so it maps onto Thieme's design system; no inline styles.
- **Accessibility:** semantic HTML, visible focus, keyboard-only flows work, Esc closes overlays, axe clean.
- **SEO:** `generateMetadata` sets `noindex` and the canonical article URL on token pages.

### Testing standards
- Test behaviour, not implementation; names read as sentences (“returns the article page when the token has expired”).
- Arrange, act, assert; one behaviour per test.
- Test-data builders in `testkit` (`anArticle().withDoi(…).openAccess()`) instead of large fixtures.
- No network in unit tests; recorded fixtures for integration; Testcontainers for Postgres.
- Every port has a contract suite; every adapter runs it.
- React: Testing Library queries by role and label; Playwright for end-to-end flows.

### Git and review workflow
- Trunk-based: short-lived branches, pull requests under ~400 changed lines.
- Conventional Commits, checked by commitlint; Husky + lint-staged run format, lint and affected tests before each commit.
- PR template: what changed, why, how it was tested, which edge cases it covers.
- Changesets for versions and the changelog; images tagged with the semantic version.
- Decisions that change the design get an ADR in `docs/adr/`.

### Definition of done (every task)
- Types strict, no `any`, no `@ts-ignore`
- Unit and contract tests added; coverage gate holds
- Lint, format, type check and dependency rules pass
- Edge cases from this doc handled and tested
- Logs and metrics for any new path; no query text logged
- README or docs updated if behaviour or setup changed
- No `TODO` without a linked issue

## Step-by-step delivery plan
Nine phases over about 6 weeks part-time; each ends with an exit check, and you only move on when it passes. Phase 5 (Postgres) can be cut to a migration file if time runs short.

### Phase 0: Feasibility spike (2 days)
- Pull 500 Crossref records; measure abstract, license and language coverage; save 20 JATS samples as fixtures
- Check Europe PMC full-text coverage for Thieme open access journals
- Run multilingual-e5-small through transformers.js and sqlite-vec in Node 22 inside Docker (amd64 and arm64)
- MCP hello-world tool working in Claude Desktop and MCP Inspector
- Quick test: 10 German queries against 10 English abstracts; does the model match them?
Exit: coverage numbers and the cross-language test written down; go or switch model.

### Phase 1: Foundations (2–3 days)
- pnpm workspace, strict tsconfig, ESLint, Prettier, Vitest, Husky pre-commit
- CI skeleton (lint, type check, test)
- Domain types and zod schemas; ports: `Source`, `Store`, `Embedder`, `Entitlements`, `Meter`
- Config loader (fail fast), pino logging, error types
- Contract test harness for stores and sources
- ADRs for the decisions above
Exit: CI green; ports compile; contract suite runs against an in-memory fake.

### Phase 2: Ingestion (4–5 days)
- Crossref source: cursor paging, polite pool, retries, checkpoints, incremental sync
- Normaliser, JATS cleaner, license gate, retraction handling
- Chunker and embedder with batching
- SQLite store: schema, FTS5 and trigram tables, vec table, atomic file swap
- Europe PMC full-text source for allowlisted licenses
- CLI: `ingest full`, `ingest incremental`, `ingest verify`
Exit: 2024+ corpus indexed from scratch; a second run changes 0 rows; verify report passes.

### Phase 3: Search (4 days)
- Lexical search with stemming, folding and safe query building
- Vector search, filters, RRF fusion, collapse to articles, snippets, cursors
- Golden set (60 queries) and eval script with recall@10, MRR, nDCG@10
- Tune chunk size and candidate counts against the eval, not by feel
Exit: recall@10 ≥ 0.8 overall and ≥ 0.7 cross-language; p95 under 500 ms.

### Phase 4: MCP server (3–4 days)
- Six tools with schemas, descriptions and annotations
- Streamable HTTP and stdio transports
- API-key auth, per-key rate limits, error codes, `Origin` checks (Superseded by ADR 0048: the server is public; rate limits are per client address.)
- `/healthz`, `/readyz`, `/metrics`, OpenTelemetry traces
- Metering outbox and exporter (JSON lines + webhook); entitlement mock
Exit: protocol tests pass; all tools work in Claude Desktop and MCP Inspector.

### Phase 4b: Landing experience (3 days)
- Landing session store and token resolver API
- Next.js reference landing page: chosen article on top, other matches, matched passage, access options, related reading
- MCP Apps card list for clients that support it
- Referral beacon, UTM handling, noindex + canonical, DOI fallback
- Funnel view in the metering dashboard: searches → cards shown → landing visits → next action
Exit: a search in Claude leads, in one click, to a personalised page; Playwright suite green; LCP under 2.5 s.

### Phase 5: Postgres adapter (2–3 days)
- Versioned migrations, store implementation, read-only role
- Contract suite passing on Testcontainers
- `docker compose --profile postgres`
Exit: golden-set results within 2 points of SQLite.

### Phase 6: Hardening and docs (3 days)
- Load test, fuzzing, security scans, graceful shutdown
- Non-root distroless image; image size checked
- README quick start, `ADAPTERS.md`, `OPERATIONS.md`, `SECURITY.md`
Exit: someone else goes from fresh clone to working server in under 5 minutes, unaided.

### Phase 7: Demo deployment and recording (2 days)
- Host in the EU with HTTPS and a demo API key; uptime check
- Prepare 5 demo questions (German, English, cross-language, a paywalled article, a retraction)
- Record the Loom; write the one-page memo
Exit: public URL stable for 7 days; video under 5 minutes.

### Phase 8: Outreach (1 day)
- Send to your interviewer or the hiring manager, plus someone on Thieme's data and AI side
- Ask for 15 minutes of feedback, not a job
Exit: sent, with a follow-up date set.

## Deliverables
Four pieces, each for a different reader: the Loom for attention, the memo for decision-makers, the repo and docs for engineers, the hosted demo for anyone who wants to try it.
**Repository layout**
```
scholarly-mcp/
  packages/
    core/              domain types, zod schemas, ports, search + RRF, article cards
    source-crossref/   Crossref adapter (metadata, abstracts, licenses)
    source-europepmc/  open access full text, used for matching only
    store-sqlite/      FTS5 + trigram + sqlite-vec, landing sessions
    store-postgres/    tsvector + pgvector, migrations
    embedder-onnx/     multilingual-e5-small via transformers.js
    testkit/           contract suites, fixtures, golden set
  apps/
    ingest/            CLI: full, incremental, verify
    server/            MCP server: tools, MCP Apps cards, auth, metering, health
    landing/           Next.js reference landing page (token to personalised page)
  presets/thieme.env   DOI prefix 10.1055, journal list, landing base URL
  docker/              Dockerfile, compose (sqlite and postgres profiles)
  docs/                ADAPTERS.md, LANDING.md, OPERATIONS.md, SECURITY.md, adr/
```
**README must answer, in this order:** what it is (2 lines), a 30-second GIF, the quick start (`docker run` + connecting Claude), the tools, how to plug in your own content API, architecture, limits.
**Loom (under 5 minutes)**
| Time | Content |
| 0:00–0:30 | Live: a German clinical question in Claude returns Thieme article cards; one click lands on a Thieme page built for that search |
| 0:30–1:15 | Why it matters: assistants are where readers go; Wiley, Springer Nature and Elsevier are already there |
| 1:15–2:30 | Three more demos: cross-language, paywalled article (abstract + subscribe link), retracted paper excluded |
| 2:30–3:30 | Architecture: one container, adapters, how Thieme plugs in its own API and Postgres |
| 3:30–4:15 | Business: usage metering for usage-based billing, licensing to AI companies, institutional add-on |
| 4:15–4:45 | What production needs, and the ask: 15 minutes of feedback |
**One-page memo:** problem, competitor moves, what the prototype does, how it fits Thieme's systems, what it would take to run, links to demo, video and repo.
**Hosted demo:** EU-hosted HTTPS endpoint, a demo key, and copy-paste instructions for adding it as a connector in Claude and ChatGPT.

## Risks and open questions
The biggest risk is thin content (most articles have no abstract); Phase 0 measures it before anything else is built.
| Risk | Mitigation |
| Only about 37% of 2024+ articles have abstracts, so many results are title-only | Add open access full text from Europe PMC; present it as a metadata-only demo that improves with Thieme's own content |
| Reuse rights for abstracts and open access full text | Official APIs only; CC BY allowlist; the audience is Thieme, the rights holder |
| Small embedding model misses cross-language matches | Measured in Phase 0; fall back to bge-m3 (larger image, slower) |
| sqlite-vec is pre-1.0 | Hidden behind the `Store` port; Postgres path exists |
| Thieme is already building something similar | The prototype still shows judgement and ability; ask about it in the outreach |
| Scope creep | Exit checks per phase; Postgres adapter is optional |
| AI clients summarise the cards instead of showing the links, or doctors don't click | Short teasers, MCP Apps cards, clear tool descriptions; measure click-through per client from day one and tune teaser length against it |
| Too little content makes the AI prefer other sources | Keep enough in each card (teaser, why it matched) for the AI to judge relevance; test in Claude and ChatGPT during Phase 4b |
**Open questions**
- Does Thieme run Postgres, and on which cloud? The design doesn't depend on it; ask in the outreach.
- Which two specialties to showcase in the demo (pick ones with many German-language journals)?
- Where to host the demo, and the monthly budget for it?
- Confirm abstract reuse terms for Crossref-deposited abstracts.
**References**
- [Crossref API: Thieme journal articles since 2024](https://api.crossref.org/prefixes/10.1055/works?rows=0&filter=from-pub-date:2024-01-01,type:journal-article) (71,435)
- [Crossref API: same, with abstracts](https://api.crossref.org/prefixes/10.1055/works?rows=0&filter=from-pub-date:2024-01-01,type:journal-article,has-abstract:true) (26,328)
- [Model Context Protocol specification](https://modelcontextprotocol.io)
- [sqlite-vec](https://github.com/asg017/sqlite-vec)
- [Europe PMC REST API](https://europepmc.org/RestfulWebService)
