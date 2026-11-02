import {
  normalizeDoi,
  normalizeText,
  type Doi,
  type FullTextLabel,
  type FullTextSection,
} from '@scholarly-mcp/core';
import { isTag, isText, type ChildNode as Node, type Element } from 'domhandler';
import { DomUtils, parseDocument } from 'htmlparser2';
import { europepmcLicenseFamily, licenseFamily } from '../license/license-family.js';
import { isBackMatter, sectionLabel } from './section-label.js';

/** What the text must be: the article's version of record, under the reference's licence. */
export interface ExpectedText {
  readonly doi: Doi;
  readonly licenseUrl: string;
}

/** Why a full text was not used. Each is logged and counted, never shown. */
export type RejectReason =
  | 'not jats'
  | 'doi mismatch'
  | 'manuscript'
  | 'preprint'
  | 'retracted'
  | 'tdm reserved'
  | 'licence mismatch'
  | 'no text';

export type FullTextResult =
  | { readonly kind: 'text'; readonly sections: readonly FullTextSection[] }
  | { readonly kind: 'rejected'; readonly reason: RejectReason };

/** Elements whose content is not prose to match on: floats, formulas, citations, notes. */
const SKIPPED = new Set([
  'alternatives',
  'caption',
  'disp-formula',
  'fig',
  'fig-group',
  'fn',
  'fn-group',
  'graphic',
  'inline-formula',
  'inline-graphic',
  'label',
  'math',
  'media',
  'ref-list',
  'supplementary-material',
  'table',
  'table-wrap',
  'table-wrap-group',
  'tex-math',
  'title',
  'xref',
]);

/** Elements that hold one paragraph of prose. */
const PARAGRAPH = new Set(['p', 'def', 'disp-quote']);

/** `custom-meta` flags Europe PMC sets on its JATS, with the value that disqualifies a text. */
const DISQUALIFYING_META: readonly (readonly [string, RejectReason])[] = [
  ['is-manuscript', 'manuscript'],
  ['is-preprint', 'preprint'],
  ['is-retracted', 'retracted'],
];

/**
 * Reads a Europe PMC JATS full text into sections for matching (ADR 0024). The text is used
 * only when it is the expected article's version of record: its DOI matches, it is not
 * flagged as an author manuscript, preprint or retracted, it carries no text and data mining
 * reservation, and any Creative Commons licence it states is of the reference's family.
 * Only `<body>` is read, without back matter, floats, formulas or citation markers. Top-level
 * sections become sections, labelled generically or not at all; headings are never kept.
 */
export function readFullText(xml: string, expected: ExpectedText): FullTextResult {
  const document = parseDocument(xml, { xmlMode: true });
  const article = DomUtils.findOne(
    (element) => localName(element) === 'article',
    document.children,
  );
  if (article === null) return rejected('not jats');

  const meta = childOf(childOf(article, 'front'), 'article-meta');
  const reason = metaProblem(meta, expected);
  if (reason !== undefined) return rejected(reason);

  const body = childOf(article, 'body');
  const sections = body === undefined ? [] : bodySections(body);
  return sections.length === 0 ? rejected('no text') : { kind: 'text', sections };
}

function metaProblem(meta: Element | undefined, expected: ExpectedText): RejectReason | undefined {
  if (meta === undefined) return 'not jats';
  const doiId = meta.children.find(
    (node): node is Element =>
      isElement(node, 'article-id') && DomUtils.getAttributeValue(node, 'pub-id-type') === 'doi',
  );
  if (doiId === undefined || normalizeDoi(DomUtils.textContent(doiId)) !== expected.doi) {
    return 'doi mismatch';
  }

  const flags = customMeta(meta);
  for (const [name, reason] of DISQUALIFYING_META) {
    if (flags.get(name) === 'yes') return reason;
  }
  for (const [name, value] of flags) {
    if (/tdm/i.test(name) && !/^(?:no|0|false)$/i.test(value)) return 'tdm reserved';
  }

  const stated = statedLicenseFamilies(childOf(meta, 'permissions'));
  const family = licenseFamily(expected.licenseUrl);
  if (stated.size > 0 && (family === undefined || !stated.has(family))) return 'licence mismatch';
  return undefined;
}

/** `meta-name` to lowercase `meta-value` for every `custom-meta` in the article meta. */
function customMeta(meta: Element): Map<string, string> {
  const flags = new Map<string, string>();
  for (const entry of DomUtils.getElementsByTagName('custom-meta', meta.children)) {
    const name = textOf(childOf(entry, 'meta-name'));
    const value = textOf(childOf(entry, 'meta-value'));
    if (name !== '') flags.set(name.toLowerCase(), value.toLowerCase());
  }
  return flags;
}

/** Creative Commons families named by licence links or in the permissions text. */
function statedLicenseFamilies(permissions: Element | undefined): Set<string> {
  const families = new Set<string>();
  if (permissions === undefined) return families;
  for (const element of DomUtils.findAll(() => true, permissions.children)) {
    for (const attribute of ['xlink:href', 'href']) {
      const family = licenseFamily(DomUtils.getAttributeValue(element, attribute) ?? '');
      if (family !== undefined) families.add(family);
    }
    if (localName(element) === 'license_ref' || localName(element) === 'license-type') {
      const text = textOf(element);
      const family = licenseFamily(text) ?? europepmcLicenseFamily(text);
      if (family !== undefined) families.add(family);
    }
  }
  for (const match of DomUtils.textContent(permissions).matchAll(
    /creativecommons\.org\/(?:licenses\/[a-z-]+|publicdomain\/zero)/gi,
  )) {
    const family = licenseFamily(match[0]);
    if (family !== undefined) families.add(family);
  }
  return families;
}

/**
 * Prose outside any section (a case report's teaching point, say) forms an unlabelled
 * section of its own, in document order.
 */
function bodySections(body: Element): FullTextSection[] {
  const sections: FullTextSection[] = [];
  let loose: string[] = [];
  const flushLoose = () => {
    if (loose.length > 0) sections.push({ paragraphs: loose });
    loose = [];
  };
  for (const node of body.children) {
    if (!isTag(node)) continue;
    if (localName(node) === 'sec') {
      flushLoose();
      const title = titleOf(node);
      if (isBackMatter(title, DomUtils.getAttributeValue(node, 'sec-type'))) continue;
      const paragraphs = paragraphsIn(node);
      const label: FullTextLabel | undefined = sectionLabel(title);
      if (paragraphs.length > 0) {
        sections.push(label === undefined ? { paragraphs } : { label, paragraphs });
      }
    } else {
      loose.push(...paragraphsIn(node));
    }
  }
  flushLoose();
  return sections;
}

/** The paragraphs inside an element, skipping floats and nested back matter. */
function paragraphsIn(element: Element): string[] {
  const name = localName(element);
  if (SKIPPED.has(name)) return [];
  if (
    name === 'sec' &&
    isBackMatter(titleOf(element), DomUtils.getAttributeValue(element, 'sec-type'))
  ) {
    return [];
  }
  if (PARAGRAPH.has(name)) {
    const text = proseOf(element);
    return text === '' ? [] : [text];
  }
  return element.children.flatMap((node) => (isTag(node) ? paragraphsIn(node) : []));
}

/** A paragraph's text without citation markers, formulas or floats, whitespace collapsed. */
function proseOf(element: Element): string {
  const parts: string[] = [];
  const walk = (nodes: readonly Node[]) => {
    for (const node of nodes) {
      if (isText(node)) parts.push(node.data);
      else if (isTag(node) && !SKIPPED.has(localName(node))) walk(node.children);
    }
  };
  walk(element.children);
  return collapse(parts.join(''));
}

function titleOf(sec: Element): string | undefined {
  const title = childOf(sec, 'title');
  return title === undefined ? undefined : textOf(title);
}

function childOf(element: Element | undefined, name: string): Element | undefined {
  return element?.children.find((node): node is Element => isElement(node, name));
}

function isElement(node: Node, name: string): node is Element {
  return isTag(node) && localName(node) === name;
}

function textOf(element: Element | undefined): string {
  return element === undefined ? '' : collapse(DomUtils.textContent(element));
}

function collapse(text: string): string {
  return normalizeText(text)
    .replace(/[([][\s,;–-]*[)\]]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:)\]])/g, '$1')
    .replace(/([([])\s+/g, '$1')
    .trim();
}

/** The element name without a namespace prefix, e.g. `ali:license_ref` gives `license_ref`. */
function localName(element: Element): string {
  return element.name.slice(element.name.indexOf(':') + 1).toLowerCase();
}

function rejected(reason: RejectReason): FullTextResult {
  return { kind: 'rejected', reason };
}
