import type { Language } from '../article/language.js';

/**
 * Function words that are frequent in one language and rare in the other, plus `patients`,
 * the corpus's most frequent English content word. Words both
 * languages use (`in`, `an`, `so`, `was`, `will`, `also`, `die`, `am`) are left out, as is
 * `von`, which English medical text uses in eponyms such as "von Willebrand".
 */
const STOPWORDS: Readonly<Record<'de' | 'en', ReadonlySet<string>>> = {
  de: new Set(
    (
      'der das den dem des ein eine einer eines einem einen und oder nicht ist sind wurde ' +
      'wurden werden wird worden mit zu zum zur bei beim auf für aus nach über unter durch ' +
      'sich auch als wie dass sowie nur noch vor zwischen gegen ohne kann können konnte ' +
      'konnten sollte sollten waren haben hat hatte hatten bzw im ins vom wir sie er es diese ' +
      'dieser dieses diesem diesen jedoch insbesondere häufig sehr bereits wenn sowohl ' +
      'weitere weiterhin bisher kein keine ihre ihrer seine seiner welche welcher deren'
    ).split(' '),
  ),
  en: new Set(
    (
      'the of and or not is are were be been being with from to for by on at as this that ' +
      'these those which who whose than then there their they it its we our has have had ' +
      'can could may might should would after before between during into over under while ' +
      'whereas however both each such more most other only no yes all any what when where ' +
      'how did does do patients'
    ).split(' '),
  ),
};
/** Letters that occur in German words and almost never in English ones. */
const GERMAN_LETTERS = /[äöüß]/;
const WORD = /\p{L}+/gu;

/** Fewer signal words than this is too little evidence to decide. */
const MIN_EVIDENCE = 3;
/** The winning language needs this share of the evidence. */
const MIN_SHARE = 0.7;

/**
 * Detects whether a passage is German or English, the two languages of the corpus. Returns
 * `undefined` when the evidence is thin or mixed, so callers can fall back to the article's
 * language (chunking) or stem with both languages (search). Other languages also return
 * `undefined`.
 */
export function detectLanguage(text: string): Language | undefined {
  let de = 0;
  let en = 0;
  for (const [word] of text.toLowerCase().matchAll(WORD)) {
    if (STOPWORDS.de.has(word) || GERMAN_LETTERS.test(word)) de += 1;
    else if (STOPWORDS.en.has(word)) en += 1;
  }
  const total = de + en;
  if (total < MIN_EVIDENCE) return undefined;
  if (de / total >= MIN_SHARE) return 'de';
  if (en / total >= MIN_SHARE) return 'en';
  return undefined;
}
