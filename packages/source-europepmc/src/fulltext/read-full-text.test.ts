import { normalizeDoi, type Doi } from '@scholarly-mcp/core';
import { describe, expect, it } from 'vitest';
import { endoscopyXml } from '../testing/europepmc-fixtures.js';
import { readFullText, type ExpectedText } from './read-full-text.js';

const doi = normalizeDoi('10.1055/a-0000-0001') as Doi;
const expected: ExpectedText = {
  doi,
  licenseUrl: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
};

/** A small JATS article in Europe PMC's shape, with overridable parts. */
function jats({
  articleDoi = '10.1055/A-0000-0001',
  meta = '',
  permissions = '<permissions><license><license-p>CC BY-NC-ND (https://creativecommons.org/licenses/by-nc-nd/4.0/)</license-p></license></permissions>',
  body = '<sec><title>1. Introduction</title><p>Anticoagulation matters.</p></sec>',
}: { articleDoi?: string; meta?: string; permissions?: string; body?: string } = {}) {
  return `<?xml version="1.0"?><article xmlns:xlink="http://www.w3.org/1999/xlink"><front>
    <article-meta><article-id pub-id-type="pmcid">PMC1</article-id>
    <article-id pub-id-type="doi">${articleDoi}</article-id>${permissions}
    <custom-meta-group>${meta}</custom-meta-group>
    <abstract><p>The abstract is never read from here.</p></abstract></article-meta></front>
    <body>${body}</body><back><ref-list><ref><p>Reference text.</p></ref></ref-list></back></article>`;
}

const flag = (name: string, value: string) =>
  `<custom-meta><meta-name>${name}</meta-name><meta-value>${value}</meta-value></custom-meta>`;

describe('readFullText', () => {
  it('reads body sections with generic labels and no headings, abstract or back matter', () => {
    const result = readFullText(
      jats({
        body: `<p>A teaching point before any section.</p>
          <sec><title>Patients and Methods</title><p>We enrolled <italic>adults</italic>
            [<xref ref-type="bibr" rid="r1">1</xref>, <xref ref-type="bibr" rid="r2">2</xref>].</p>
            <sec><title>Statistics</title><p>We used R.</p>
              <fig><caption><p>Figure caption.</p></caption></fig>
              <table-wrap><table><tr><td>cell</td></tr></table></table-wrap></sec></sec>
          <sec><title>Epidemiology of thrombosis</title><p>Common.</p><list><list-item><p>Item one.</p></list-item></list></sec>
          <sec sec-type="fn-group"><title>Notes</title><p>A footnote.</p></sec>
          <sec><title>Danksagung</title><p>Wir danken.</p></sec>`,
      }),
      expected,
    );
    expect(result).toEqual({
      kind: 'text',
      sections: [
        { paragraphs: ['A teaching point before any section.'] },
        { label: 'Methods', paragraphs: ['We enrolled adults.', 'We used R.'] },
        { paragraphs: ['Common.', 'Item one.'] },
      ],
    });
  });

  it('reads the recorded CC BY article without its back matter', () => {
    const result = readFullText(endoscopyXml, {
      doi: normalizeDoi('10.1055/a-2272-9794') as Doi,
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    });
    if (result.kind !== 'text') throw new Error(result.reason);
    const text = result.sections.flatMap((section) => section.paragraphs).join('\n');
    expect(result.sections.map((section) => section.label)).toEqual([
      'Introduction',
      'Methods',
      'Results',
      'Discussion',
    ]);
    expect(text).toContain('Barrett');
    expect(text).not.toMatch(/Contributor Information|Supplementary Materials/);
    expect(text).not.toMatch(/\[\s*\]|\(\s*\)/);
  });

  it.each([
    ['another DOI', jats({ articleDoi: '10.1055/a-9999-9999' }), 'doi mismatch'],
    ['an author manuscript', jats({ meta: flag('is-manuscript', 'yes') }), 'manuscript'],
    ['a preprint', jats({ meta: flag('is-preprint', 'yes') }), 'preprint'],
    ['a retracted text', jats({ meta: flag('is-retracted', 'yes') }), 'retracted'],
    ['a TDM reservation', jats({ meta: flag('tdm-reservation', '1') }), 'tdm reserved'],
    [
      'another licence family',
      jats({
        permissions:
          '<permissions><license xlink:href="https://creativecommons.org/licenses/by-nc/4.0/"/></permissions>',
      }),
      'licence mismatch',
    ],
    ['an empty body', jats({ body: '<sec><title>References</title><p>x</p></sec>' }), 'no text'],
    ['something else than JATS', '{"error":"none"}', 'not jats'],
  ])('rejects %s', (_case, xml, reason) => {
    expect(readFullText(xml, expected)).toEqual({ kind: 'rejected', reason });
  });

  it('accepts flags that say no, and a text without a stated licence', () => {
    const xml = jats({
      meta: flag('is-manuscript', 'no') + flag('tdm-reservation', '0'),
      permissions: '',
    });
    expect(readFullText(xml, expected).kind).toBe('text');
  });

  it('accepts a licence stated by an ali:license_ref link', () => {
    const xml = jats({
      permissions:
        '<permissions><ali:license_ref>https://creativecommons.org/licenses/by-nc-nd/4.0/</ali:license_ref></permissions>',
    });
    expect(readFullText(xml, expected).kind).toBe('text');
  });
});
