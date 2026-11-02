// Phase 0 spike: multilingual-e5-small via transformers.js + sqlite-vec; German queries vs English abstracts.
import { pipeline } from '@huggingface/transformers';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { readFile } from 'node:fs/promises';

const pairs = [
  ['10.1055/a-2204-4549', 'Tier- und Zellkulturmodelle für Phäochromozytome und Paragangliome'],
  ['10.1055/a-2209-6022', 'lokale Therapie beim fortgeschrittenen Nebennierenrindenkarzinom'],
  ['10.1055/a-2216-0269', 'Genexpression von Nebennierengewebe in fetalen Hoden bei 21-Hydroxylase-Mangel'],
  ['10.1055/s-0043-1763660', 'photoredoxkatalysierte Difluorallylierung von Amiden'],
  ['10.1055/s-0042-1751533', 'Synthese von Heterocyclen mit Metallnanopartikeln als Katalysator'],
  ['10.1055/a-2237-8711', 'Echokardiographie bei Neugeborenen mit arteriellem ischämischem Schlaganfall'],
  ['10.1055/a-2237-8309', 'Finanzierung und Struktur von Weiterbildungsprogrammen in klinischer Informatik'],
  ['10.1055/s-0043-1777674', 'endoskopische Mastoidektomie über ein Bohrloch an Leichenpräparaten'],
  ['10.1055/s-0043-1778096', 'geschlechtsangleichende Operationen in den USA, Entwicklung seit 2010'],
  ['10.1055/a-2238-7634', 'Zugang zu Mikrochirurgie-Simulationskursen in der plastischen Chirurgie'],
];
const records = JSON.parse(await readFile('out/crossref-sample.json', 'utf8'));
const docs = pairs.map(([doi]) => records.find((r) => r.DOI === doi));
const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const t0 = performance.now();
const embed = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', { dtype: 'q8' });
const loadMs = performance.now() - t0;
const vec = async (text) => (await embed(text, { pooling: 'mean', normalize: true })).data;

const db = new Database(':memory:');
sqliteVec.load(db);
db.exec('CREATE VIRTUAL TABLE v USING vec0(embedding float[384] distance_metric=cosine)');
const ins = db.prepare('INSERT INTO v(rowid, embedding) VALUES (?, ?)');
for (const [i, d] of docs.entries()) {
  ins.run(BigInt(i), Buffer.from((await vec(`passage: ${d.title[0]}. ${strip(d.abstract)}`)).buffer));
}
const knn = db.prepare('SELECT rowid, distance FROM v WHERE embedding MATCH ? AND k = 3 ORDER BY distance');
let top1 = 0;
const t1 = performance.now();
for (const [i, [, q]] of pairs.entries()) {
  const hits = knn.all(Buffer.from((await vec(`query: ${q}`)).buffer));
  if (Number(hits[0].rowid) === i) top1++;
  else console.log('miss:', q, '->', docs[Number(hits[0].rowid)].DOI);
}
console.log(JSON.stringify({ node: process.version, arch: process.arch, modelLoadMs: Math.round(loadMs), avgQueryMs: Math.round((performance.now() - t1) / pairs.length), top1: `${top1}/${pairs.length}`, sqliteVec: db.prepare('select vec_version() v').get().v }));
