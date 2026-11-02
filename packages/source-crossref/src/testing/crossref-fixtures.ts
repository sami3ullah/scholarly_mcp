import { readFileSync } from 'node:fs';

/** A recorded walk: the cursor each page was requested with, and Crossref's response. */
export interface RecordedPage {
  readonly cursor: string;
  readonly body: { message: { items: Record<string, unknown>[]; 'next-cursor'?: string } };
}

function load(file: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../fixtures/${file}`, import.meta.url), 'utf8'));
}

/** Six Thieme articles deposited on 2026-10-11, three per page, then the empty end page. */
export const walk = load('walk.json') as RecordedPage[];
/** A retraction notice, two errata and a Retraction Watch self-annotation. */
export const notices = load('notices.json') as RecordedPage['body'];
/** The article the retraction notice retracts. */
export const retracted = load('retracted.json') as RecordedPage['body'];
