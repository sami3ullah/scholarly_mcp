/**
 * Abbreviations after which a full stop does not end a sentence, in English and German
 * scientific writing. Unicode sentence rules break after them when a capital follows
 * ("et al. Results", "Dr. Müller"). A lone letter covers initials and the parts of
 * "z. B.", "d. h." and "u. a."; a sentence ending in one ("vitamin D.") joins the next,
 * which only makes that unit longer.
 */
const ABBREVIATION =
  /(?:^|[\s(])(?:\p{L}|et al|e\.g|i\.e|cf|vs|approx|ca|Dr|Prof|Fig|Figs|Tab|Abb|Nr|No|Ref|Suppl|bzw|ggf|evtl|inkl|sog|vgl|Pat)\.\s*$/u;

const segmenters = new Map<string, Intl.Segmenter>();

function segmenterFor(locale: string): Intl.Segmenter {
  let segmenter = segmenters.get(locale);
  if (segmenter === undefined) {
    segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' });
    segmenters.set(locale, segmenter);
  }
  return segmenter;
}

/**
 * Splits text into sentences with Unicode sentence rules, then rejoins breaks that follow a
 * known abbreviation. Each sentence keeps its trailing whitespace, so joining the result
 * gives back the input exactly.
 */
export function splitSentences(text: string, locale = 'en'): string[] {
  const sentences: string[] = [];
  for (const { segment } of segmenterFor(locale).segment(text)) {
    const previous = sentences.at(-1);
    if (previous !== undefined && ABBREVIATION.test(previous)) {
      sentences[sentences.length - 1] = previous + segment;
    } else {
      sentences.push(segment);
    }
  }
  return sentences;
}
