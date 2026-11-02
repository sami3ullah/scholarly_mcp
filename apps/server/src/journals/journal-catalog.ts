import type { JournalDirectory, JournalSummary } from '@scholarly-mcp/core';

/** The index's journals, loaded once per index version. */
export interface JournalCatalog {
  list(signal: AbortSignal): Promise<readonly JournalSummary[]>;
}

/** How long one shared load of the journal list may take. */
const LOAD_TIMEOUT_MS = 10_000;

/**
 * Caches the journal list per index version, since building it reads every article (about
 * 0.4 s on the live index). The load is shared by concurrent callers, so it runs under its
 * own timeout rather than one caller's signal. A failed load is not cached.
 */
export function createJournalCatalog(
  directory: JournalDirectory,
  version: () => string | undefined,
): JournalCatalog {
  let cached: { version: string; journals: Promise<JournalSummary[]> } | undefined;
  return {
    list(signal) {
      const current = version();
      if (current === undefined) return directory.journals(signal);
      if (cached?.version !== current) {
        const journals = directory.journals(AbortSignal.timeout(LOAD_TIMEOUT_MS));
        cached = { version: current, journals };
        journals.catch(() => {
          if (cached?.journals === journals) cached = undefined;
        });
      }
      return cached.journals;
    },
  };
}
