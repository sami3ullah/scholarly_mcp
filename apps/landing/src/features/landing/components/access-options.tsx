import type { LandingAccess, LandingAction, LandingArticle } from '@scholarly-mcp/core';
import type { Messages } from '../../../shared/lib/messages';
import { ButtonLink } from '../../../shared/ui/button-link';
import styles from './access-options.module.css';

const READ: LandingAction = 'read';
const SIGN_IN: LandingAction = 'sign_in';
const BUY: LandingAction = 'buy';
const VIEW: LandingAction = 'view_on_publisher';
const CHECK: LandingAction = 'check_access';

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
 * How the reader gets to the article (ARCHITECTURE.md links and landing pages): open access and
 * institutional access read on the publisher's page; paywalled articles offer sign-in and
 * purchase; an unknown state sends the reader to check on the publisher's page. Each button
 * names its funnel action (ADR 0033).
 */
export function AccessOptions(props: {
  access: LandingAccess;
  article: Pick<LandingArticle, 'articleUrl'>;
  messages: AccessMessages;
}) {
  const { access, article, messages } = props;
  return (
    <section className={styles['section']} aria-labelledby="access-options">
      {/* Named for screen readers; the buttons speak for themselves on screen. */}
      <h2 id="access-options" className="visually-hidden">
        {messages.accessHeading}
      </h2>
      <div className={styles['actions']}>{actions(access, article.articleUrl, messages)}</div>
    </section>
  );
}

function actions(access: LandingAccess, articleUrl: string, messages: AccessMessages) {
  switch (access.status) {
    case 'open':
      return (
        <ButtonLink href={articleUrl} action={READ}>
          {messages.readFullText}
        </ButtonLink>
      );
    case 'institution':
      return (
        <ButtonLink href={articleUrl} action={READ}>
          {messages.readViaInstitution}
        </ButtonLink>
      );
    case 'subscription':
      return (
        <>
          <ButtonLink href={access.loginUrl ?? articleUrl} action={SIGN_IN}>
            {messages.signIn}
          </ButtonLink>
          <ButtonLink href={access.purchaseUrl ?? articleUrl} variant="secondary" action={BUY}>
            {messages.buy}
          </ButtonLink>
          <ButtonLink href={articleUrl} variant="secondary" action={VIEW}>
            {messages.viewOnPublisher}
          </ButtonLink>
        </>
      );
    case 'unknown':
      return (
        <ButtonLink href={articleUrl} action={CHECK}>
          {messages.checkAccess}
        </ButtonLink>
      );
  }
}
