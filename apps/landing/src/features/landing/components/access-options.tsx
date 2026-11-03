import type { LandingAccess, LandingArticle } from '@scholarly-mcp/core';
import type { Messages } from '../../../shared/lib/messages';
import { ButtonLink } from '../../../shared/ui/button-link';
import styles from './access-options.module.css';

type AccessMessages = Pick<
  Messages,
  | 'accessHeading'
  | 'readFullText'
  | 'readViaInstitution'
  | 'signIn'
  | 'buy'
  | 'viewOnPublisher'
  | 'checkAccess'
>;

/**
 * How the reader gets to the article (PLAN.md links and landing pages): open access and
 * institutional access read on the publisher's page; paywalled articles offer sign-in and
 * purchase; an unknown state sends the reader to check on the publisher's page.
 */
export function AccessOptions(props: {
  access: LandingAccess;
  article: Pick<LandingArticle, 'articleUrl'>;
  messages: AccessMessages;
}) {
  const { access, article, messages } = props;
  return (
    <section className={styles['section']} aria-labelledby="access-options">
      <h2 id="access-options" className={styles['heading']}>
        {messages.accessHeading}
      </h2>
      <div className={styles['actions']}>{actions(access, article.articleUrl, messages)}</div>
    </section>
  );
}

function actions(access: LandingAccess, articleUrl: string, messages: AccessMessages) {
  switch (access.status) {
    case 'open':
      return <ButtonLink href={articleUrl}>{messages.readFullText}</ButtonLink>;
    case 'institution':
      return <ButtonLink href={articleUrl}>{messages.readViaInstitution}</ButtonLink>;
    case 'subscription':
      return (
        <>
          <ButtonLink href={access.loginUrl ?? articleUrl}>{messages.signIn}</ButtonLink>
          <ButtonLink href={access.purchaseUrl ?? articleUrl} variant="secondary">
            {messages.buy}
          </ButtonLink>
          <ButtonLink href={articleUrl} variant="secondary">
            {messages.viewOnPublisher}
          </ButtonLink>
        </>
      );
    case 'unknown':
      return <ButtonLink href={articleUrl}>{messages.checkAccess}</ButtonLink>;
  }
}
