import { normalizeText, type Author, type Journal } from '@scholarly-mcp/core';
import { cleanJatsInline } from '../jats/clean-jats.js';
import type { CrossrefWork } from './crossref-work.js';

const ORCID = /(\d{4}-\d{4}-\d{4}-\d{3}[\dX])$/i;

/**
 * Maps authors. Organisations come as `name` and are kept as a family name; an ORCID iD is
 * reduced from its URL to the bare iD, and dropped if malformed. Entries with no name at all
 * are skipped.
 */
export function mapAuthors(work: CrossrefWork): Author[] {
  return (work.author ?? []).flatMap((author) => {
    const family = tidy(author.family ?? author.name);
    if (family === undefined) return [];
    const given = tidy(author.given);
    const orcid = ORCID.exec(author.ORCID?.trim() ?? '')?.[1]?.toUpperCase();
    return [{ family, ...(given && { given }), ...(orcid && { orcid }) }];
  });
}

/**
 * Maps the journal from the container title and typed ISSNs. Crossref sometimes lists an ISSN
 * without its type; it is then stored as the print ISSN, so lookups by ISSN still find it.
 */
export function mapJournal(work: CrossrefWork): Journal {
  const typed = work['issn-type'] ?? [];
  const issnOf = (type: string) => issn(typed.find((entry) => entry.type === type)?.value);
  const issnPrint = issnOf('print') ?? (typed.length === 0 ? issn(work.ISSN?.[0]) : undefined);
  const issnElectronic = issnOf('electronic');
  return {
    name: cleanJatsInline(work['container-title']?.[0] ?? ''),
    ...(issnPrint && { issnPrint }),
    ...(issnElectronic && { issnElectronic }),
  };
}

function issn(raw: string | undefined): string | undefined {
  const compact = raw?.toUpperCase().replace(/[^\dX]/g, '') ?? '';
  return /^\d{7}[\dX]$/.test(compact) ? `${compact.slice(0, 4)}-${compact.slice(4)}` : undefined;
}

function tidy(value: string | undefined): string | undefined {
  const text = normalizeText(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text === '' ? undefined : text;
}
