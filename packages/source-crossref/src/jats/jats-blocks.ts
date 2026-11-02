import { Parser } from 'htmlparser2';

/** One paragraph of a JATS fragment, with the section label it sits under. */
export interface JatsBlock {
  readonly label?: string;
  readonly text: string;
}

/** Elements that end a paragraph. */
const BLOCK = new Set(['p', 'list', 'list-item', 'def-item', 'disp-quote', 'abstract']);
/** Elements whose content is never prose a reader should see. */
const SKIPPED = new Set([
  'annotation',
  'annotation-xml',
  'fig',
  'graphic',
  'media',
  'object-id',
  'table-wrap',
  'xref',
]);
/** Headings that only announce the abstract itself, in the languages Crossref deposits use. */
const ABSTRACT_HEADING =
  /^(?:abstract|summary|zusammenfassung|kurzfassung|résumé|resumen|resumo)$/i;

/**
 * Splits a JATS (or loose HTML) fragment into paragraphs. A title labels the paragraphs after
 * it until the next title; a nested section's label is prefixed with its parent's. Headings
 * that just say "Abstract" are dropped. MathML becomes its `alttext`, or its text when it has
 * none; TeX is dropped when a MathML alternative exists. The parser is tolerant, so malformed
 * markup from a deposit still yields text, and entities are decoded.
 */
export function jatsBlocks(fragment: string): JatsBlock[] {
  const blocks: JatsBlock[] = [];
  const open: string[] = [];
  const parentLabels: (string | undefined)[] = [];
  let text = '';
  let label: string | undefined;
  let title: string | undefined;
  let skipDepth = 0;

  const flush = () => {
    if (text.trim() !== '') blocks.push(label === undefined ? { text } : { label, text });
    text = '';
  };

  const parser = new Parser(
    {
      onopentag(rawName, attributes) {
        const name = localName(rawName);
        const insideAlternatives = open.includes('alternatives');
        open.push(name);
        if (skipDepth > 0 || SKIPPED.has(name) || (name === 'tex-math' && insideAlternatives)) {
          skipDepth += 1;
        } else if (name === 'math' && attributes['alttext'] !== undefined) {
          text += ` ${attributes['alttext']} `;
          skipDepth += 1;
        } else if (name === 'title') {
          flush();
          title = '';
        } else if (name === 'sec') {
          flush();
          parentLabels.push(label);
        } else if (BLOCK.has(name)) {
          flush();
        } else if (name === 'br') {
          text += ' ';
        }
      },
      ontext(data) {
        if (skipDepth > 0) return;
        if (title === undefined) text += data;
        else title += data;
      },
      onclosetag(rawName) {
        const name = localName(rawName);
        open.pop();
        if (skipDepth > 0) {
          skipDepth -= 1;
        } else if (name === 'title' && title !== undefined) {
          label = labelFor(parentLabels.at(-1), title) ?? label;
          title = undefined;
        } else if (name === 'sec') {
          flush();
          label = parentLabels.pop();
        } else if (BLOCK.has(name)) {
          flush();
        }
      },
    },
    { decodeEntities: true, lowerCaseTags: true, recognizeSelfClosing: true, recognizeCDATA: true },
  );
  parser.write(fragment);
  parser.end();
  flush();
  return blocks;
}

function localName(name: string): string {
  return name.slice(name.indexOf(':') + 1);
}

/** The label a title gives, or undefined when the title adds nothing. */
function labelFor(parent: string | undefined, title: string): string | undefined {
  const heading = title.replace(/\s+/g, ' ').trim().replace(/[:.]$/, '');
  if (heading === '' || ABSTRACT_HEADING.test(heading)) return parent;
  return parent === undefined ? heading : `${parent}: ${heading}`;
}
