import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadJournalSubjects } from './load-journal-subjects.js';

function presetFile(content: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'subjects-')), 'subjects.json');
  writeFileSync(path, content);
  return path;
}

describe('loadJournalSubjects', () => {
  it('indexes the preset by ISSN', () => {
    const path = presetFile(
      JSON.stringify([
        { name: 'Synlett', issns: ['0936-5214', '1437-2096'], subjects: ['Chemistry, Organic'] },
      ]),
    );
    expect(loadJournalSubjects(path).get('1437-2096')).toEqual([
      { label: 'Chemistry, Organic', origin: 'journal' },
    ]);
  });

  it('fails fast on a file that is not JSON', () => {
    expect(() => loadJournalSubjects(presetFile('{'))).toThrow(/could not be read as JSON/);
  });

  it('names the broken entry of an invalid preset', () => {
    const path = presetFile(JSON.stringify([{ name: 'Synlett', issns: ['bad'], subjects: ['X'] }]));
    expect(() => loadJournalSubjects(path)).toThrow(/0\.issns\.0/);
  });
});
