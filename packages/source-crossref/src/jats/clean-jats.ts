import { normalizeText } from '@scholarly-mcp/core';
import { isCitationOnly } from './is-citation-only.js';
import { jatsBlocks } from './jats-blocks.js';
import { splitLeadingHeading } from './leading-heading.js';

/**
 * Turns a Crossref JATS abstract into plain text: paragraphs separated by a blank line,
 * section labels kept as `Label: text`, entities decoded, MathML flattened, whitespace
 * collapsed and text normalised. Returns undefined when nothing readable is left, or when the
 * "abstract" is only a citation of another work, which some translated republications
 * deposit; indexing that would invent an abstract the article does not have.
 */
export function cleanJatsAbstract(fragment: string): string | undefined {
  const paragraphs = jatsBlocks(fragment)
    .map(({ label, text }) => labelled(label, clean(text)))
    .filter(({ text }) => text !== '');
  if (paragraphs.length === 0 || isCitationOnly(paragraphs.map(({ text }) => text))) {
    return undefined;
  }
  return paragraphs.map(({ label, text }) => withLabel(label, text)).join('\n\n');
}

/** Cleans a one-line field such as a title: markup and entities resolved, whitespace collapsed. */
export function cleanJatsInline(fragment: string): string {
  return clean(
    jatsBlocks(fragment)
      .map(({ label, text }) => [label, text].join(' '))
      .join(' '),
  );
}

/** Prefixes the label unless the text already starts with it; a question needs no colon. */
function withLabel(label: string | undefined, text: string): string {
  if (label === undefined || text.startsWith(label)) return text;
  return /[?!]$/.test(label) ? `${label} ${text}` : `${label}: ${text}`;
}

/** Uses the markup's label, or else a heading run into the start of the paragraph. */
function labelled(label: string | undefined, text: string): { label?: string; text: string } {
  return label === undefined ? splitLeadingHeading(text) : { label: clean(label), text };
}

function clean(text: string): string {
  return normalizeText(text).replace(/\s+/g, ' ').trim();
}
