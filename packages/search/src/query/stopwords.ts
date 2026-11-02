import { foldText } from '@scholarly-mcp/core';

/*
 * German and English function words and question words. Unlike the language detector's
 * lists, words both languages share (`die`, `in`, `was`) are included: here the question is
 * only whether a word carries meaning for lexical matching, not which language it is.
 */
const WORDS =
  'der die das den dem des ein eine einer eines einem einen und oder nicht kein keine ist ' +
  'sind war waren wird werden wurde wurden sein hat haben mit von vom zu zum zur bei beim ' +
  'auf für aus nach über unter durch im in an am als wie auch bzw sowie ohne gegen vor ' +
  'zwischen ich du er sie es wir ihr man was wer wo wann warum welche welcher welches ' +
  'gibt sich dass ob the a an and or not no is are was were be been being of ' +
  'on at to for by with from as into about than then what which who whom how when where ' +
  'why does do did there any some this that these those it its can should vs versus';

const STOPWORDS: ReadonlySet<string> = new Set(WORDS.split(' ').map(foldText));

/** True for a word that carries no meaning for lexical matching, in German or English. */
export function isStopword(word: string): boolean {
  return STOPWORDS.has(foldText(word));
}
