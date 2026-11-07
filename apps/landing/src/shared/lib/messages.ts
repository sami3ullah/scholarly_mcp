/** The interface languages; a page uses its search's language (ADR 0032). */
export type UiLanguage = 'de' | 'en';

/** Every string the landing page shows, so a design system can swap them in one place. */
export interface Messages {
  readonly expiredNotice: string;
  readonly authorsMore: (count: number) => string;
  readonly retracted: string;
  readonly retractedNotice: string;
  readonly access: Readonly<Record<'open' | 'subscription' | 'institution' | 'unknown', string>>;
  readonly accessHeading: string;
  readonly readFullText: string;
  readonly readViaInstitution: string;
  readonly signIn: string;
  readonly buy: string;
  readonly viewOnPublisher: string;
  readonly checkAccess: string;
  readonly abstract: string;
  readonly noAbstract: string;
  readonly showMore: string;
  readonly showLess: string;
  readonly matchedHeading: string;
  readonly matchedInTitle: string;
  readonly matchedInFullText: (section?: string) => string;
  readonly subjects: string;
  readonly license: string;
  readonly licenseUnknown: string;
  readonly related: string;
  readonly disclaimer: string;
  readonly notFoundHeading: string;
  readonly notFoundText: string;
  readonly noLinkHeading: string;
  readonly noLinkText: string;
  readonly errorHeading: string;
  readonly errorText: string;
  readonly retry: string;
}

const en: Messages = {
  expiredNotice: 'This link has expired, so only the article is shown.',
  authorsMore: (count) => `and ${String(count)} more`,
  retracted: 'Retracted',
  retractedNotice: 'This article has been retracted. Do not rely on its findings.',
  access: {
    open: 'Open access',
    subscription: 'Subscription',
    institution: 'Institutional access',
    unknown: 'Access unknown',
  },
  accessHeading: 'Read this article',
  readFullText: 'Read the full article',
  readViaInstitution: 'Read via your institution',
  signIn: 'Sign in through your institution',
  buy: 'Buy this article',
  viewOnPublisher: "View on the publisher's site",
  checkAccess: "Check access on the publisher's site",
  abstract: 'Abstract',
  noAbstract: 'No abstract is available for this article.',
  showMore: 'Show full abstract',
  showLess: 'Show less',
  matchedHeading: 'Where your search matched',
  matchedInTitle: 'Your search matched the title of this article.',
  matchedInFullText: (section) =>
    section === undefined
      ? 'Your search matched the full text of this article.'
      : `Your search matched the "${section}" section of the full text.`,
  subjects: 'Subjects',
  license: 'Licence',
  licenseUnknown: 'Licence not stated',
  related: 'Related reading',
  disclaimer: 'Independent prototype, not affiliated with any publisher.',
  notFoundHeading: 'This link is no longer available',
  notFoundText: 'Landing links work for 24 hours. Ask your assistant again to get fresh results.',
  noLinkHeading: 'There is no article here',
  noLinkText:
    "This site opens the article links in your AI assistant's search results. Click one of those links to see the article.",
  errorHeading: 'This page could not be loaded',
  errorText: 'Something went wrong on our side. Please try again in a moment.',
  retry: 'Try again',
};

const de: Messages = {
  expiredNotice: 'Dieser Link ist abgelaufen, daher wird nur der Artikel angezeigt.',
  authorsMore: (count) => `und ${String(count)} weitere`,
  retracted: 'Zurückgezogen',
  retractedNotice:
    'Dieser Artikel wurde zurückgezogen. Verlassen Sie sich nicht auf seine Ergebnisse.',
  access: {
    open: 'Open Access',
    subscription: 'Abonnement',
    institution: 'Zugang über Ihre Einrichtung',
    unknown: 'Zugang unbekannt',
  },
  accessHeading: 'Artikel lesen',
  readFullText: 'Vollständigen Artikel lesen',
  readViaInstitution: 'Über Ihre Einrichtung lesen',
  signIn: 'Über Ihre Einrichtung anmelden',
  buy: 'Artikel kaufen',
  viewOnPublisher: 'Beim Verlag ansehen',
  checkAccess: 'Zugang beim Verlag prüfen',
  abstract: 'Zusammenfassung',
  noAbstract: 'Für diesen Artikel ist keine Zusammenfassung verfügbar.',
  showMore: 'Ganze Zusammenfassung zeigen',
  showLess: 'Weniger zeigen',
  matchedHeading: 'Wo Ihre Suche getroffen hat',
  matchedInTitle: 'Ihre Suche hat den Titel dieses Artikels getroffen.',
  matchedInFullText: (section) =>
    section === undefined
      ? 'Ihre Suche hat den Volltext dieses Artikels getroffen.'
      : `Ihre Suche hat den Abschnitt „${section}“ im Volltext getroffen.`,
  subjects: 'Themen',
  license: 'Lizenz',
  licenseUnknown: 'Lizenz nicht angegeben',
  related: 'Verwandte Artikel',
  disclaimer: 'Unabhängiger Prototyp, mit keinem Verlag verbunden.',
  notFoundHeading: 'Dieser Link ist nicht mehr verfügbar',
  notFoundText:
    'Landing-Links gelten 24 Stunden. Fragen Sie Ihren Assistenten erneut nach aktuellen Ergebnissen.',
  noLinkHeading: 'Hier ist kein Artikel',
  noLinkText:
    'Diese Seite öffnet die Artikel-Links aus den Suchergebnissen Ihres KI-Assistenten. Klicken Sie auf einen dieser Links, um den Artikel zu sehen.',
  errorHeading: 'Diese Seite konnte nicht geladen werden',
  errorText: 'Bei uns ist etwas schiefgelaufen. Bitte versuchen Sie es gleich noch einmal.',
  retry: 'Erneut versuchen',
};

/** The strings for a language. */
export function messagesFor(language: UiLanguage): Messages {
  return language === 'de' ? de : en;
}
