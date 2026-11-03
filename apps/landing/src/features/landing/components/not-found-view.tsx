import { messagesFor } from '../../../shared/lib/messages';
import styles from './status-view.module.css';

/** Shown for a link with neither a live token nor a DOI to fall back to. */
export function NotFoundView() {
  const messages = messagesFor('en');
  return (
    <main className={styles['page']}>
      <h1 className={styles['heading']}>{messages.notFoundHeading}</h1>
      <p>{messages.notFoundText}</p>
    </main>
  );
}
