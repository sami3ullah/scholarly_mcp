'use client';

import { useId, type KeyboardEvent } from 'react';
import { cx } from '../../../shared/lib/cx';
import { useExpandable } from '../hooks/use-expandable';
import styles from './expandable-abstract.module.css';

/** Abstracts longer than this start collapsed, so the access options stay near the top. */
export const COLLAPSE_AFTER_CHARACTERS = 600;

/**
 * The abstract, collapsed when long. The whole text is in the page from the start, so it
 * needs no request and screen readers can read it; collapsing is visual only. Esc collapses.
 */
export function ExpandableAbstract(props: { text: string; showMore: string; showLess: string }) {
  const long = props.text.length > COLLAPSE_AFTER_CHARACTERS;
  const { expanded, toggle, collapse } = useExpandable(!long);
  const id = useId();
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && long) collapse();
  };
  return (
    <div onKeyDown={onKeyDown}>
      <div id={id} className={cx(styles['text'], !expanded && styles['collapsed'])}>
        {props.text.split(/\n{2,}/).map((paragraph, index) => (
          // Paragraphs have no identity beyond their position in one fixed text.
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      {long && (
        <button
          type="button"
          className={styles['toggle']}
          aria-expanded={expanded}
          aria-controls={id}
          onClick={toggle}
        >
          {expanded ? props.showLess : props.showMore}
        </button>
      )}
    </div>
  );
}
