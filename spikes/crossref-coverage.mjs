// Phase 0 spike: measure abstract, license and language coverage on a Crossref sample.
import { writeFile, mkdir } from 'node:fs/promises';

const base = 'https://api.crossref.org/prefixes/10.1055/works';
const filter = 'from-pub-date:2024-01-01,type:journal-article';
const records = [];
let cursor = '*';
while (records.length < 500) {
  const url = `${base}?filter=${filter}&rows=100&cursor=${encodeURIComponent(cursor)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'scholarly-mcp-spike/0.0' } });
  if (!res.ok) throw new Error(`Crossref ${res.status}`);
  const body = await res.json();
  records.push(...body.message.items);
  cursor = body.message['next-cursor'];
  if (body.message.items.length === 0) break;
}

const count = (pred) => records.filter(pred).length;
const tally = (fn) => records.reduce((m, r) => { for (const k of fn(r)) m[k] = (m[k] ?? 0) + 1; return m; }, {});
const stats = {
  total: records.length,
  withAbstract: count((r) => r.abstract),
  withLicense: count((r) => r.license?.length),
  withLanguage: count((r) => r.language),
  languages: tally((r) => [r.language ?? 'none']),
  licenses: tally((r) => (r.license ?? []).map((l) => `${l['content-version']} ${l.URL}`)),
  withUpdateTo: count((r) => r['update-to']),
  withRelation: count((r) => r.relation && Object.keys(r.relation).length),
  withAuthors: count((r) => r.author?.length),
  datePrecision: tally((r) => [String((r.published?.['date-parts']?.[0] ?? []).length)]),
  withSubject: count((r) => r.subject?.length),
  journals: Object.keys(tally((r) => r['container-title'] ?? [])).length,
};
console.log(JSON.stringify(stats, null, 2));

await mkdir('out', { recursive: true });
await writeFile('out/crossref-sample.json', JSON.stringify(records));
