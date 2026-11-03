import { readFileSync } from 'node:fs';
import { doiSchema, type Doi } from '@scholarly-mcp/core';

/**
 * Reads a DOI list (ADR 0039): one DOI per line; blank lines and `#` comments are skipped.
 * A missing file, an empty list or a line that is not a DOI stops the ingest before it starts.
 */
export function loadDoiList(path: string): Doi[] {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(`INGEST_DOIS_FILE could not be read: ${path}`, { cause: error });
  }
  const dois: Doi[] = [];
  const problems: string[] = [];
  text.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const parsed = doiSchema.safeParse(line);
    if (parsed.success) dois.push(parsed.data);
    else problems.push(`- line ${String(index + 1)}: not a DOI`);
  });
  if (problems.length > 0) {
    throw new Error(`Invalid INGEST_DOIS_FILE ${path}:\n${problems.join('\n')}`);
  }
  if (dois.length === 0) throw new Error(`INGEST_DOIS_FILE lists no DOIs: ${path}`);
  return dois;
}
