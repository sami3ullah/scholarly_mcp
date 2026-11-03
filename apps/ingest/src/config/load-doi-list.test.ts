import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDoiList } from './load-doi-list.js';

function listFile(content: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'dois-')), 'dois.txt');
  writeFileSync(path, content);
  return path;
}

describe('loadDoiList', () => {
  it('reads one normalised DOI per line, skipping blanks and comments', () => {
    const path = listFile('# demo\n10.1055/A-2245-1234\n\n  https://doi.org/10.1055/s-0042-1  \n');
    expect(loadDoiList(path)).toEqual(['10.1055/a-2245-1234', '10.1055/s-0042-1']);
  });

  it('names the lines that are not DOIs', () => {
    expect(() => loadDoiList(listFile('10.1055/a-1\nnope\n'))).toThrow(/line 2: not a DOI/);
  });

  it('fails fast on a missing file or an empty list', () => {
    expect(() => loadDoiList('/nonexistent/dois.txt')).toThrow(/could not be read/);
    expect(() => loadDoiList(listFile('# nothing\n'))).toThrow(/lists no DOIs/);
  });
});
