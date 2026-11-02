/* global fetch, process, URL -- Node 24 globals */
// Records the Europe PMC responses the tests replay. Run from this package's folder:
//   node scripts/record-fixtures.mjs
// Search results keep only the fields the adapter reads (no abstracts or author lists).
// Full texts are saved verbatim, and only CC BY ones: they may be redistributed with
// attribution, which each file carries in its <permissions>. CC BY-NC-ND texts are not
// committed (ADR 0024); tests build those cases from small synthetic XML instead.
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const API = 'https://www.ebi.ac.uk/europepmc/webservices/rest';
const DOIS = [
  '10.1055/a-2272-9794', // CC BY, full text, MeSH
  '10.1055/a-2328-7464', // CC BY-NC-ND, full text, case report
  '10.1055/a-2319-3045', // CC BY-NC-ND, German full text
  '10.1055/a-2567-5178', // closed, author manuscript in Europe PMC
  '10.1055/s-0046-1829078', // CC BY at Crossref, no full text in Europe PMC
  '10.1055/s-0044-1787668', // CC BY-NC-ND, keywords only
  '10.1055/s-0042-1751569', // not in Europe PMC
];
const FULL_TEXTS = ['PMC11288659'];
const KEPT = [
  'id',
  'source',
  'pmid',
  'pmcid',
  'doi',
  'title',
  'language',
  'isOpenAccess',
  'inEPMC',
  'inPMC',
  'license',
  'authMan',
  'epmcAuthMan',
  'nihAuthMan',
  'fullTextIdList',
  'meshHeadingList',
  'keywordList',
  'fullTextReceivedDate',
  'dateOfRevision',
];

const OUT = new URL('../fixtures/', import.meta.url);
const headers = { 'user-agent': 'scholarly-mcp fixture recorder' };

const query = DOIS.map((doi) => `DOI:"${doi}"`).join(' OR ');
const url = new URL(`${API}/search`);
for (const [key, value] of Object.entries({
  query,
  resultType: 'core',
  format: 'json',
  pageSize: '1000',
  cursorMark: '*',
})) {
  url.searchParams.set(key, value);
}
const search = await (await fetch(url, { headers })).json();
search.resultList.result = search.resultList.result.map((hit) =>
  Object.fromEntries(KEPT.filter((key) => key in hit).map((key) => [key, hit[key]])),
);
delete search.request;
await writeFile(new URL('search.json', OUT), `${JSON.stringify(search, null, 2)}\n`);

for (const pmcid of FULL_TEXTS) {
  await delay(500);
  const response = await fetch(`${API}/${pmcid}/fullTextXML`, { headers });
  await writeFile(new URL(`fulltext/${pmcid}.xml`, OUT), await response.text());
}
process.stdout.write(
  `Recorded ${String(search.resultList.result.length)} search hits, ${String(FULL_TEXTS.length)} full text(s)\n`,
);
