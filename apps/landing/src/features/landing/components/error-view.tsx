'use client';

import { messagesFor } from '../../../shared/lib/messages';
import styles from './status-view.module.css';

/** Shown when the landing API fails for a link that has no DOI to fall back to. */
export function ErrorView(props: { onRetry: () => void }) {
  const messages = messagesFor('en');
  return (
    <main className={styles['page']}>
      <h1 className={styles['heading']}>{messages.errorHeading}</h1>
      <p>{messages.errorText}</p>
      <button type="button" className={styles['retry']} onClick={props.onRetry}>
        {messages.retry}
      </button>
    </main>
  );
}
