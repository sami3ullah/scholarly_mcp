import { readdir, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { cleanJatsAbstract, cleanJatsInline } from './clean-jats.js';

describe('cleanJatsAbstract', () => {
  it('strips tags and drops a leading "Abstract" heading', () => {
    expect(
      cleanJatsAbstract('<jats:title>Abstract</jats:title><jats:p>Dosing matters.</jats:p>'),
    ).toBe('Dosing matters.');
  });

  it.each(['Zusammenfassung', 'Summary', 'ABSTRACT', 'Abstract.'])(
    'drops a "%s" heading',
    (heading) => {
      expect(cleanJatsAbstract(`<jats:title>${heading}</jats:title><jats:p>Text.</jats:p>`)).toBe(
        'Text.',
      );
    },
  );

  it('keeps section labels in front of their paragraphs', () => {
    const jats =
      '<jats:sec><jats:title>Background</jats:title><jats:p>Why.</jats:p></jats:sec>' +
      '<jats:sec><jats:title>Methods:</jats:title><jats:p>How.</jats:p><jats:p>More.</jats:p></jats:sec>';
    expect(cleanJatsAbstract(jats)).toBe('Background: Why.\n\nMethods: How.\n\nMethods: More.');
  });

  it('lets a flat title label the paragraphs after it until the next title', () => {
    const jats =
      '<jats:title>Ziel</jats:title><jats:p>A.</jats:p><jats:title>Methode</jats:title><jats:p>B.</jats:p>';
    expect(cleanJatsAbstract(jats)).toBe('Ziel: A.\n\nMethode: B.');
  });

  it('prefixes a nested section label with its parent and restores the parent after it', () => {
    const jats =
      '<jats:sec><jats:title>Results</jats:title><jats:p>Overall.</jats:p>' +
      '<jats:sec><jats:title>Primary outcome</jats:title><jats:p>Better.</jats:p></jats:sec>' +
      '<jats:p>Also.</jats:p></jats:sec>';
    expect(cleanJatsAbstract(jats)).toBe(
      'Results: Overall.\n\nResults: Primary outcome: Better.\n\nResults: Also.',
    );
  });

  it('does not add a colon after a label that is a question', () => {
    expect(
      cleanJatsAbstract(
        '<jats:sec><jats:title>Was ist neu?</jats:title><jats:p>Viel.</jats:p></jats:sec>',
      ),
    ).toBe('Was ist neu? Viel.');
  });

  it('does not repeat a label the paragraph already starts with', () => {
    expect(
      cleanJatsAbstract('<jats:title>Background</jats:title><jats:p>Background: why.</jats:p>'),
    ).toBe('Background: why.');
  });

  it('decodes XML, HTML and numeric entities', () => {
    expect(
      cleanJatsAbstract('<jats:p>p &lt; 0.05 &amp; n &gt; 10, &auml;, &#946;, &#x2264;</jats:p>'),
    ).toBe('p < 0.05 & n > 10, ä, β, ≤');
  });

  it('keeps inline formatting as plain text without adding spaces', () => {
    expect(
      cleanJatsAbstract(
        '<jats:p>CO<jats:sub>2</jats:sub> and <jats:italic>E. coli</jats:italic></jats:p>',
      ),
    ).toBe('CO2 and E. coli');
  });

  it('uses the MathML alttext when present', () => {
    const math =
      '<jats:p>Given <mml:math alttext="x^2"><mml:msup><mml:mi>x</mml:mi><mml:mn>2</mml:mn></mml:msup></mml:math> here</jats:p>';
    expect(cleanJatsAbstract(math)).toBe('Given x^2 here');
  });

  it('flattens MathML without alttext to its text and skips annotations', () => {
    const math =
      '<jats:p>ΔE<mml:math><mml:semantics><mml:mi>S</mml:mi><mml:mi>T</mml:mi>' +
      '<mml:annotation encoding="application/x-tex">S T</mml:annotation></mml:semantics></mml:math></jats:p>';
    expect(cleanJatsAbstract(math)).toBe('ΔEST');
  });

  it('drops TeX when a MathML alternative exists', () => {
    const formula =
      '<jats:p>Rate <jats:inline-formula><jats:alternatives><jats:tex-math>\\alpha</jats:tex-math>' +
      '<mml:math alttext="α"/></jats:alternatives></jats:inline-formula>.</jats:p>';
    expect(cleanJatsAbstract(formula)).toBe('Rate α .');
  });

  it('skips figures, tables and cross-reference markers', () => {
    const jats =
      '<jats:p>Shown<jats:xref ref-type="bibr">12</jats:xref>.</jats:p>' +
      '<jats:fig><jats:caption><jats:p>Figure text</jats:p></jats:caption></jats:fig>' +
      '<jats:table-wrap><jats:table><jats:tr><jats:td>1</jats:td></jats:tr></jats:table></jats:table-wrap>';
    expect(cleanJatsAbstract(jats)).toBe('Shown.');
  });

  it('turns list items into paragraphs', () => {
    expect(
      cleanJatsAbstract(
        '<jats:list><jats:list-item><jats:p>One</jats:p></jats:list-item><jats:list-item>Two</jats:list-item></jats:list>',
      ),
    ).toBe('One\n\nTwo');
  });

  it('collapses deposit whitespace and normalises the text', () => {
    expect(cleanJatsAbstract('<jats:p>  Herz­insuffizienz\n      bei   Gefäßen </jats:p>')).toBe(
      'Herzinsuffizienz bei Gefäßen',
    );
  });

  it('still yields text from malformed markup and plain text', () => {
    expect(cleanJatsAbstract('<jats:p>Unclosed <jats:italic>tag')).toBe('Unclosed tag');
    expect(cleanJatsAbstract('No markup at all.')).toBe('No markup at all.');
  });

  it.each([
    ['empty', ''],
    ['only a heading', '<jats:title>Abstract</jats:title>'],
    ['only whitespace', '<jats:p>  \n </jats:p>'],
    ['only invisible characters', '<jats:p>​­</jats:p>'],
  ])('returns undefined when the abstract is %s', (_case, jats) => {
    expect(cleanJatsAbstract(jats)).toBeUndefined();
  });

  it('drops an "abstract" that only cites the original article', () => {
    const citation =
      '<jats:title>Psychologische Faktoren selten bei CRPS berücksichtigt</jats:title>' +
      '<jats:p>Griffiths GS, Thompson BL, Snell DL et al. Person-centred management of upper limb ' +
      'complex regional pain syndrome. Hand Therapy 2023; 28: 16–32</jats:p>';
    expect(cleanJatsAbstract(citation)).toBeUndefined();
  });
});

describe('cleanJatsInline', () => {
  it('cleans a deposited title to one line', () => {
    expect(
      cleanJatsInline('Ratgeber – 40 Übungen für\n                    schmerzfreie Gelenke'),
    ).toBe('Ratgeber – 40 Übungen für schmerzfreie Gelenke');
  });

  it('resolves markup and entities in titles', () => {
    expect(cleanJatsInline('<i>In vitro</i> Effects of A&amp;B on Ca<sup>2+</sup>')).toBe(
      'In vitro Effects of A&B on Ca2+',
    );
  });
});

describe('cleanJatsAbstract on the SM-00 samples', async () => {
  const directory = new URL('../../../testkit/fixtures/jats/', import.meta.url);
  const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();

  it('has the 20 recorded samples', () => {
    expect(files).toHaveLength(20);
  });

  it.each(files)('cleans %s', async (file) => {
    const sample = JSON.parse(await readFile(new URL(file, directory), 'utf8')) as {
      abstract: string;
    };
    const cleaned = cleanJatsAbstract(sample.abstract);
    expect(cleaned ?? '').not.toMatch(/<[a-z]|&[a-z#0-9]+;/i);
    expect(cleaned).toMatchSnapshot();
  });
});
