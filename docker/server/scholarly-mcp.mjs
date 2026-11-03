#!/usr/bin/env node
// The image's one entrypoint: `serve` (default), `keys …` and `funnel …` run the server app,
// `ingest …` the ingest app. Each app reads its own arguments from process.argv[2].
const USAGE = 'Usage: scholarly-mcp [serve] | keys … | funnel … | ingest …';
const [command = 'serve'] = process.argv.slice(2);

if (command === 'ingest' || command === 'serve') process.argv.splice(2, 1);
if (command === 'ingest') {
  await import('./apps/ingest/dist/main.js');
} else if (command === 'serve' || command === 'keys' || command === 'funnel') {
  await import('./apps/server/dist/main.js');
} else {
  process.stderr.write(`${USAGE}\n`);
  process.exitCode = 2;
}
