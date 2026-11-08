#!/usr/bin/env node
// The image's one entrypoint: `serve` (default) and `funnel …` run the server app,
// `ingest …` the ingest app. Each app reads its own arguments from process.argv[2].
const USAGE = 'Usage: scholarly-mcp [serve] | funnel … | ingest …';
const [command = 'serve'] = process.argv.slice(2);

// SCHOLARLY_PRESET names a file in /app/presets whose settings apply unless already set, so
// a bare `docker run` gets the preset of the index it carries; empty turns it off.
const preset = process.env.SCHOLARLY_PRESET ?? '';
if (preset !== '') {
  if (!/^[a-z0-9-]+$/.test(preset)) {
    process.stderr.write(`SCHOLARLY_PRESET must name a preset such as thieme, not ${preset}\n`);
    process.exit(2);
  }
  process.loadEnvFile(new URL(`./presets/${preset}.env`, import.meta.url));
}

if (command === 'ingest' || command === 'serve') process.argv.splice(2, 1);
if (command === 'ingest') {
  await import('./apps/ingest/dist/main.js');
} else if (command === 'serve' || command === 'funnel') {
  await import('./apps/server/dist/main.js');
} else {
  process.stderr.write(`${USAGE}\n`);
  process.exitCode = 2;
}
