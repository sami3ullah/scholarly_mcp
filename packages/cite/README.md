# @scholarly-mcp/cite

Formats an article's citation from its metadata: Vancouver, APA and AMA through CSL (citation-js, US English), and BibTeX and RIS records for reference managers. Pure formatting: no I/O beyond loading the vendored AMA style once.

```ts
import { formatCitation } from '@scholarly-mcp/cite';

formatCitation(article, 'vancouver');
// Lovelace A. Rivaroxaban dosing in patients with atrial fibrillation. Thrombosis and Haemostasis. 2024 Mar 14. doi:10.1055/a-2245-1234
```

- Dates keep the precision the source gave: a year-only record cites as "2024".
- The article's language is passed to CSL, so German titles are not title-cased.
- The URL is the publisher's landing page; APA and Vancouver cite the DOI.
- Numeric styles drop their "1." list number; RIS values are never wrapped.
- Volume, issue and pages are cited as the publisher deposited them (`S 01`, `e12-e20`) and left out when absent.

Styles: see [styles/README.md](styles/README.md) for the AMA style's source and licence. Snapshot tests cover every style for a fully dated record, one with volume, issue and pages, a German multi-author one and a year-only one. Rules: [ADR 0025](../../docs/adr/0025-mcp-server-and-tool-rules.md).
