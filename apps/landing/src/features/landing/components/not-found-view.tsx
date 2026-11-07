import { messagesFor } from '../../../shared/lib/messages';
import styles from './status-view.module.css';

/**
 * `expired-link`: a landing link with neither a live token nor a DOI to fall back to.
 * `no-link`: any other address, such as the site's root, which has no page of its own.
 */
export function NotFoundView(props: { reason: 'expired-link' | 'no-link' }) {
  const messages = messagesFor('en');
  const expired = props.reason === 'expired-link';
  return (
    <main className={styles['page']}>
      <h1 className={styles['heading']}>
        {expired ? messages.notFoundHeading : messages.noLinkHeading}
      </h1>
      <p>{expired ? messages.notFoundText : messages.noLinkText}</p>
    </main>
  );
}
