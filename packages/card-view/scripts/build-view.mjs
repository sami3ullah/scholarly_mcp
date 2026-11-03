// Bundles the card view (src/view) into one self-contained HTML file, dist/card-view.html,
// that the server serves as its MCP Apps UI resource (ADR 0033). Nothing is loaded from
// elsewhere at runtime: the script and styles are inlined.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const root = new URL('..', import.meta.url);
const result = await build({
  entryPoints: [new URL('src/view/main.ts', root).pathname],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  legalComments: 'none',
  write: false,
});
const script = result.outputFiles[0].text.replaceAll('</script', '<\\/script');
const template = await readFile(new URL('src/view/template.html', root), 'utf8');
// A function replacement, so `$` sequences in the bundle are not read as patterns.
const html = template.replace('__CARD_VIEW_SCRIPT__', () => script);
await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/card-view.html', root), html);
process.stdout.write(`card-view.html: ${String(Math.round(html.length / 1024))} KB\n`);
