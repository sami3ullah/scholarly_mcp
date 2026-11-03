import type { MatchedPassage as Passage } from '@scholarly-mcp/core';
import type { Messages } from '../../../shared/lib/messages';
import styles from './matched-passage.module.css';

/**
 * Where the search matched the chosen article. Abstract text is quoted; a title or
 * full-text match is only named, as full text is never shown (ADR 0003).
 */
export function MatchedPassage(props: {
  passage: Passage;
  messages: Pick<Messages, 'matchedHeading' | 'matchedInTitle' | 'matchedInFullText'>;
}) {
  const { passage, messages } = props;
  return (
    <section className={styles['section']} aria-labelledby="matched-passage">
      <h2 id="matched-passage" className={styles['heading']}>
        {messages.matchedHeading}
      </h2>
      {passage.in === 'abstract' ? (
        <blockquote className={styles['quote']}>
          {passage.section !== undefined && (
            <span className={styles['section-label']}>{passage.section}</span>
          )}
          <p>{passage.text}</p>
        </blockquote>
      ) : (
        <p className={styles['note']}>
          {passage.in === 'title'
            ? messages.matchedInTitle
            : messages.matchedInFullText(passage.section)}
        </p>
      )}
    </section>
  );
}
