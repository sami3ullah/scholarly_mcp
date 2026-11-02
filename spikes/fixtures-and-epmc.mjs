// Phase 0 spike: save JATS abstract fixtures and measure Europe PMC full-text coverage for CC-licensed records.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const records = JSON.parse(await readFile('out/crossref-sample.json', 'utf8'));
const withAbstract = records.filter((r) => r.abstract);
const pick = [
  ...withAbstract.filter((r) => r.language === 'de').slice(0, 10),
  ...withAbstract.filter((r) => r.language === 'en').slice(0, 10),
];
const dir = '../packages/testkit/fixtures/jats';
await mkdir(dir, { recursive: true });
for (const r of pick) {
  const name = r.DOI.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  await writeFile(`${dir}/${name}.json`, JSON.stringify({ DOI: r.DOI, language: r.language, title: r.title, abstract: r.abstract }, null, 2));
}

const oa = records.filter((r) => r.license?.some((l) => l.URL.includes('creativecommons')));
let inEpmc = 0, fullText = 0, inPmc = 0;
for (const r of oa) {
  const q = encodeURIComponent(`DOI:"${r.DOI}"`);
  const res = await fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${q}&format=json&resultType=lite`);
  const hit = (await res.json()).resultList?.result?.[0];
  if (!hit) continue;
  inEpmc++;
  if (hit.inEPMC === 'Y') fullText++;
  if (hit.pmcid) inPmc++;
}
console.log(JSON.stringify({ fixturesSaved: pick.length, ccLicensed: oa.length, inEpmc, withPmcid: inPmc, fullTextInEpmc: fullText }, null, 2));
const sample = pick[0].abstract.slice(0, 400);
console.log('JATS sample:', sample);
