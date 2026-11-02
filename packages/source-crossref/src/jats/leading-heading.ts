/**
 * Standard structured-abstract headings, English and German. Some deposits run the heading
 * into the paragraph with no markup ("Results A total of 504 …").
 */
const HEADING = new RegExp(
  '^(' +
    [
      'background and study aims',
      'background and aims?',
      'background',
      'introduction',
      'objectives?',
      'aims?',
      'purpose',
      'study design',
      'patients and methods',
      'materials? and methods',
      'methods?',
      'results?',
      'conclusions?',
      'discussion',
      'hintergrund',
      'einleitung',
      'fragestellung',
      'zielsetzung',
      'ziel(?:e)?',
      'material und methoden?',
      'patienten und methoden?',
      'methoden?',
      'methodik',
      'ergebnis(?:se)?',
      'schlussfolgerung(?:en)?',
      'diskussion',
      'fazit',
    ].join('|') +
    ') ',
  'i',
);
/** Checked separately, because the case-insensitive heading match would also relax this. */
const STARTS_SENTENCE = /^[\p{Lu}\d]/u;

/**
 * Splits a run-in heading from the start of a paragraph, so "Results A total of 504" becomes
 * a "Results" label with "A total of 504" as text. Requires a capital letter or digit after
 * the heading, so a sentence such as "Results of the trial …" is left alone.
 */
export function splitLeadingHeading(text: string): { label?: string; text: string } {
  const match = HEADING.exec(text);
  const heading = match?.[1];
  const rest = heading === undefined ? '' : text.slice(heading.length + 1);
  if (heading === undefined || !STARTS_SENTENCE.test(rest)) return { text };
  return { label: heading, text: rest };
}
