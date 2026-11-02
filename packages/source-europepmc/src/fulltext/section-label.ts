import type { FullTextLabel } from '@scholarly-mcp/core';

/** Section types (JATS `sec-type`) that hold back matter, not the article's argument. */
const BACK_MATTER_TYPES = new Set([
  'ack',
  'associated-data',
  'author-contributions',
  'coi-statement',
  'contrib-info',
  'data-availability',
  'display-objects',
  'ethics-statement',
  'fn-group',
  'funding',
  'ref-list',
  'supplementary-material',
  'supplementary-materials',
]);

/** Headings of back matter in English and German, for sections without a `sec-type`. */
const BACK_MATTER_TITLE = new RegExp(
  '^(?:' +
    [
      'footnotes?',
      'contributor information',
      'references?',
      'bibliography',
      'literatur(?:verzeichnis)?',
      'funding(?: statement)?',
      'förderung',
      'finanzierung',
      'acknowledge?ments?',
      'danksagung',
      'conflicts? of interest',
      'interessenkonflikte?',
      'competing interests',
      'declaration of interest',
      "authors?['’]?s?['’]? contributions?",
      'autorenbeitr(?:ä|ae)ge',
      'beitr(?:ä|ae)ge der autor',
      'data availability',
      'availability of data',
      'verfügbarkeit von daten',
      '(?:trial |study )?registration',
      'studienregistrierung',
      'supplementary',
      'associated data',
      'ethic(?:s|al)',
      'ethikvotum',
      'consent',
      'abbreviations',
      'abkürzungen',
      'errat(?:um|a)',
      'corrigend(?:um|a)',
      'correction',
      'korrektur',
      // Supplementary display items, e.g. "Tables 1s–6s, Fig. 1s"; not "Figures of speech".
      'tables?\\s*\\d',
      'fig(?:ure)?s?\\.?\\s*\\d',
    ].join('|') +
    // A whole word: "Correction" is back matter, "Correctional facilities" is not.
    ')(?!\\p{L})',
  'iu',
);

/** Heading patterns per generic label, in the order they are tried. */
const LABELS: readonly (readonly [FullTextLabel, RegExp])[] = [
  [
    'Case report',
    /^(?:case(?:\s+(?:report|presentation|description|history|series)|\s+\d+)?|fallbericht|fallvorstellung|falldarstellung|kasuistik)\b/i,
  ],
  [
    'Conclusion',
    /^(?:conclusions?|concluding remarks|summary and conclusions?|schlussfolgerung(?:en)?|fazit)\b/i,
  ],
  ['Introduction', /^(?:introduction|background|einleitung|einführung|hintergrund)\b/i],
  ['Results', /^(?:results?|findings|ergebnisse?)\b/i],
  ['Discussion', /^(?:discussion|diskussion)\b/i],
  ['Methods', /\b(?:methods?|methodology|methodik|methoden?|study design|studiendesign)\b/i],
];

/** Leading numbering such as "2.", "2.1" or "II." before a heading. */
const NUMBERING = /^\s*(?:\d+(?:\.\d+)*|[IVX]+)\.?\s+/;

/** True when a section is back matter (references, footnotes, funding, ...), not text to index. */
export function isBackMatter(title: string | undefined, secType: string | undefined): boolean {
  if (secType !== undefined && BACK_MATTER_TYPES.has(secType.toLowerCase())) return true;
  return title !== undefined && BACK_MATTER_TITLE.test(cleanTitle(title));
}

/**
 * Maps a section heading to a generic label, or undefined when it matches none. The heading
 * itself is never kept: it is article content, and the label is what `whyMatched` may show.
 */
export function sectionLabel(title: string | undefined): FullTextLabel | undefined {
  if (title === undefined) return undefined;
  const heading = cleanTitle(title);
  return LABELS.find(([, pattern]) => pattern.test(heading))?.[0];
}

function cleanTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim().replace(NUMBERING, '');
}
