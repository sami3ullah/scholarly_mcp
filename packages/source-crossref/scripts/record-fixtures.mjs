/* global fetch, process, URL, URLSearchParams -- Node 24 globals */
// Records real Crossref responses for the integration and contract tests.
// Run from the package folder: node scripts/record-fixtures.mjs
// Reference lists are removed to keep fixtures small; the adapter never reads them.
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const API = 'https://api.crossref.org/prefixes/10.1055/works';
const USER_AGENT = 'scholarly-mcp fixture recorder (https://github.com/sami3ullah/scholarly_mcp)';
const OUT = new URL('../fixtures/', import.meta.url);

/** A small walk: one deposit day with six journal articles, three per page. */
const WALK_FILTER =
  'type:journal-article,from-pub-date:2024-01-01,from-update-date:2026-10-11,until-update-date:2026-10-11';
/** A retraction notice, two errata (one flagged only by its title) and a self-annotated retraction. */
const NOTICE_DOIS = [
  '10.1055/a-2575-5491',
  '10.1055/a-2367-4608',
  '10.1055/s-0044-1788560',
  '10.1055/s-2004-817674',
];
/** The article the retraction notice retracts. */
const RETRACTED_DOIS = ['10.1055/a-2458-7088'];

async function get(params) {
  await delay(1100); // the public pool allows one request per second
  const response = await fetch(`${API}?${new URLSearchParams(params)}`, {
    headers: { 'user-agent': USER_AGENT },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${params.filter}`);
  const body = await response.json();
  for (const item of body.message.items) delete item.reference;
  return body;
}

async function recordWalk() {
  const pages = [];
  let cursor = '*';
  for (;;) {
    const body = await get({
      filter: WALK_FILTER,
      sort: 'deposited',
      order: 'asc',
      rows: '3',
      cursor,
    });
    pages.push({ cursor, body });
    if (body.message.items.length === 0) return pages;
    cursor = body.message['next-cursor'];
  }
}

async function lookup(dois) {
  return get({ filter: dois.map((doi) => `doi:${doi}`).join(','), rows: String(dois.length) });
}

await mkdir(OUT, { recursive: true });
const fixtures = {
  'walk.json': await recordWalk(),
  'notices.json': await lookup(NOTICE_DOIS),
  'retracted.json': await lookup(RETRACTED_DOIS),
};
for (const [file, data] of Object.entries(fixtures)) {
  await writeFile(new URL(file, OUT), `${JSON.stringify(data, null, 2)}\n`);
  process.stdout.write(`wrote fixtures/${file}\n`);
}
