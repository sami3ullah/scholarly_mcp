/** A run of abstract paragraphs under one section label, e.g. "Methods". */
export interface AbstractSection {
  readonly label?: string;
  readonly paragraphs: readonly string[];
}

/**
 * A label as the JATS cleaner writes it: a capitalised phrase of up to five words without
 * sentence punctuation, then ": ". Only the first label counts, so "Results: Primary
 * outcome: …" belongs to "Results".
 */
const LABEL = /^(\p{Lu}[^\s.,;:!?]*(?: [^\s.,;:!?]+){0,4}): (?=\S)/u;
const PARAGRAPH_BREAK = /\n\s*\n/;

/**
 * Splits a cleaned abstract (paragraphs separated by blank lines, each led by its section
 * label) into labelled sections, merging consecutive paragraphs with the same label.
 * Labels are trusted only when the abstract has at least two different ones; otherwise a
 * sentence such as "Two groups were compared: A and B" would lose its start to a label.
 */
export function parseAbstract(abstract: string): AbstractSection[] {
  const paragraphs = abstract
    .split(PARAGRAPH_BREAK)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');
  const labelled = paragraphs.map((paragraph) => {
    const label = LABEL.exec(paragraph)?.[1];
    return label === undefined
      ? { text: paragraph }
      : { label, text: paragraph.slice(label.length + 2) };
  });
  const labels = new Set(labelled.flatMap(({ label }) => (label === undefined ? [] : [label])));
  if (labels.size < 2) return paragraphs.length === 0 ? [] : [{ paragraphs }];

  const sections: { label?: string; paragraphs: string[] }[] = [];
  for (const { label, text } of labelled) {
    const current = sections.at(-1);
    if (current !== undefined && current.label === label) current.paragraphs.push(text);
    else sections.push({ ...(label !== undefined && { label }), paragraphs: [text] });
  }
  return sections;
}
