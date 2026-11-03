/** The card view's words, in the reader's language (the host's locale). */
export interface Labels {
  readonly read: (publisher: string) => string;
  readonly openAccess: string;
  readonly subscription: string;
  readonly unknownAccess: string;
  readonly noResults: string;
  readonly allResults: string;
  readonly waiting: string;
}

const EN: Labels = {
  read: (publisher) => `Read on ${publisher}`,
  openAccess: 'Open access',
  subscription: 'Subscription',
  unknownAccess: 'Access unknown',
  noResults: 'No articles matched.',
  allResults: 'All results on one page',
  waiting: 'Loading articles…',
};

const DE: Labels = {
  read: (publisher) => `Bei ${publisher} lesen`,
  openAccess: 'Open Access',
  subscription: 'Abonnement',
  unknownAccess: 'Zugang unbekannt',
  noResults: 'Keine passenden Artikel gefunden.',
  allResults: 'Alle Ergebnisse auf einer Seite',
  waiting: 'Artikel werden geladen…',
};

/** German for a German locale (`de`, `de-AT`, …), else English. */
export function labelsFor(locale: string | undefined): Labels {
  return locale?.toLowerCase().startsWith('de') === true ? DE : EN;
}
