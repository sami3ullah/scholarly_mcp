#!/usr/bin/env node
// Load test: tool calls at a fixed rate against a running server, run by
// docker/e2e/load.sh. Seven in ten calls search, the rest look up or relate one of the demo
// articles. Prints p50/p95/p99 latency, throughput and failures as JSON.
//   LOAD_MCP_URL=http://127.0.0.1:18081 [LOAD_RATE=20] [LOAD_SECONDS=60] \
//   node docker/e2e/load.mjs
import { readFileSync } from 'node:fs';
import autocannon from 'autocannon';

const url = new URL('/mcp', required('LOAD_MCP_URL'));
const rate = Number(process.env.LOAD_RATE ?? 20);
const seconds = Number(process.env.LOAD_SECONDS ?? 60);

const QUERIES = [
  'atrial fibrillation anticoagulation in elderly patients',
  'total knee arthroplasty outcomes',
  'palladium catalysed cross-coupling',
  'Schlaganfall Thrombolyse Zeitfenster',
  'pediatric sepsis biomarkers',
  'endoscopic resection of colorectal polyps',
  'Diabetes Typ 2 Insulintherapie',
  'MRI of the rotator cuff',
  'asymmetric organocatalysis',
  'Hörsturz Kortison',
  'neonatal jaundice phototherapy',
  'Wirbelsäulenchirurgie Komplikationen',
];
const DOIS = readFileSync(new URL('../../presets/thieme.demo-dois.txt', import.meta.url), 'utf8')
  .split('\n')
  .filter((line) => line.startsWith('10.'))
  .slice(0, 40);

let id = 0;
const pick = (list) => list[Math.floor(Math.random() * list.length)];
function nextCall() {
  const roll = Math.random();
  if (roll < 0.7) return ['search_articles', { query: pick(QUERIES), limit: 5 }];
  if (roll < 0.85) return ['get_article', { doi: pick(DOIS) }];
  return ['find_related', { doi: pick(DOIS), limit: 5 }];
}

/** Tool errors by code, e.g. `RATE_LIMITED`. */
const toolErrors = {};
const times = [];
const instance = autocannon({
  url: url.toString(),
  method: 'POST',
  connections: 10,
  overallRate: rate,
  duration: seconds,
  timeout: 30,
  headers: {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': '2025-06-18',
  },
  requests: [
    {
      setupRequest(request) {
        const [name, args] = nextCall();
        id += 1;
        return {
          ...request,
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            method: 'tools/call',
            params: { name, arguments: args },
          }),
        };
      },
      onResponse(status, body) {
        if (status !== 200 || !(body.includes('"isError":true') || body.includes('"error":'))) {
          return;
        }
        const code = /\\?"code\\?":\\?"([A-Z_]+)/.exec(body)?.[1] ?? 'unknown';
        toolErrors[code] = (toolErrors[code] ?? 0) + 1;
      },
    },
  ],
});
instance.on('response', (_client, _status, _bytes, responseTime) => times.push(responseTime));

const result = await instance;
times.sort((a, b) => a - b);
const percentile = (p) =>
  Math.round(times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))] ?? 0);
process.stdout.write(
  `${JSON.stringify(
    {
      rate,
      seconds,
      requests: result.requests.total,
      perSecond: Number(result.requests.average.toFixed(1)),
      latencyMs: {
        p50: percentile(50),
        p95: percentile(95),
        p99: percentile(99),
        max: result.latency.max,
      },
      non2xx: result.non2xx,
      errors: result.errors,
      timeouts: result.timeouts,
      toolErrors,
    },
    null,
    2,
  )}\n`,
);

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}
