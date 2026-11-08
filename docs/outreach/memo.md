# scholarly-mcp: Thieme articles inside AI assistants, readers on Thieme's site

_Draft memo, one page. Independent prototype, not affiliated with Thieme. Links at the end._

**The problem.** Doctors increasingly ask an AI assistant instead of searching a publisher's site: 92% of surveyed DACH doctors use AI tools, ChatGPT most of all (FOMF, Sep 2026). Of thieme-connect.de's roughly 438,000 monthly visits, only about 1.5% come from AI platforms (Semrush, Sep 2026). Elsevier, Wiley and Springer Nature already make their content reachable from assistants. Thieme, the strongest German-language medical publisher, does not yet.

**What the prototype does.** An MCP server, the open standard that Claude, ChatGPT and other assistants use to call tools. A reader asks a clinical question in German or English; the assistant gets a short list of Thieme articles with title, journal, year, a teaser of at most 280 characters, why each one matched, and a link. The link opens a landing page on Thieme's own domain built for that search: the chosen article, the other matches, access options (open, subscription, login, purchase) and related reading. The assistant never receives the article itself, so readers, reading and conversion stay on Thieme's site.

- Six read-only tools: search, article details, related articles, journal details, citations (Vancouver, APA, AMA, BibTeX, RIS), access status. Retracted articles are left out of search and flagged when asked about.
- German and English, including a German question finding English papers.
- Indexes all ~71,000 Thieme journal articles since 2024 from Crossref, with Europe PMC open access full text used for matching only. Official APIs only, no scraping.
- Every link carries a session token and UTM tags; a funnel report shows searches, cards shown per journal, landing visits and click-through, by journal, tool and day. No query text is ever stored, logged or put in a URL, because doctors may type patient details.

**How it fits Thieme's systems.** One container image. Thieme can point it at its own content API instead of Crossref (one adapter), connect real entitlements (one adapter), send usage to its billing system (signed webhook), and rebuild the reference landing page in its own web stack (a documented API). It runs on SQLite with no setup, or on Thieme's existing Postgres.

**What it takes to run.** A self-hosting guide brings a fresh Linux VM, AWS or Cloudflare to a working HTTPS deployment with Docker Compose: one hostname, automatic certificates, and a public endpoint that Claude, ChatGPT and claude.ai connect to with the URL alone, rate limited per client. One 2-vCPU server handles 20 tool calls a second (p95 about 0.4 s); Postgres scales to several replicas. Index refresh is one scheduled command.

**Where it stands.** Production-grade engineering (strict TypeScript, about 1,600 tests, security scans, signed multi-arch images, SBOMs), released as v0.2.0. Known gap: recall@10 on a 60-question golden set is 0.71 against a 0.8 target, weakest on cross-language questions; query translation and a reranker are the next levers. Click-through from assistants is not yet measured on real users.

**The ask.** 15 minutes of feedback from whoever owns digital products or AI at Thieme, and, if it is useful, a 30-day pilot with one hospital or department to measure reach and click-through with Thieme's own numbers.

**Links.** Video (under 5 minutes): _Loom link_ · Repository: https://github.com/sami3ullah/scholarly_mcp · Self-hosting: https://github.com/sami3ullah/scholarly_mcp/blob/main/docs/SELF-HOSTING.md · Contact: _name, email_
