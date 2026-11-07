import type { LandingPage, Token, ToolName } from '@scholarly-mcp/core';
import { messagesFor } from '../../../shared/lib/messages';
import { ActionTracker } from './action-tracker';
import { ChosenArticle } from './chosen-article';
import styles from './landing-view.module.css';
import { ReferralBeacon } from './referral-beacon';
import { RelatedReading } from './related-reading';

/**
 * The landing page's layout (PLAN.md React conventions, ADR 0046): one reading column with the
 * chosen article, then related reading. The search's other results stay in the chat, so the
 * page is about one article. Layout only; the parts render themselves.
 */
export function LandingView(props: {
  page: LandingPage;
  token: Token | undefined;
  campaign: ToolName | undefined;
}) {
  const { page, token } = props;
  // Only a live session attributes referrals to a search (ADR 0033).
  const tracked = page.session === 'active' ? token : undefined;
  const messages = messagesFor(page.language);
  const chosen = (
    <ChosenArticle
      article={page.chosen}
      access={page.access}
      passage={page.matchedPassage}
      messages={messages}
      language={page.language}
    />
  );
  return (
    <main className={styles['page']} lang={page.language}>
      {page.session === 'unavailable' && (
        <p className={styles['notice']}>{messages.expiredNotice}</p>
      )}
      {tracked === undefined ? (
        chosen
      ) : (
        <ActionTracker token={tracked} doi={page.chosen.doi}>
          {chosen}
        </ActionTracker>
      )}
      <RelatedReading related={page.related} messages={messages} />
      <footer className={styles['footer']}>{messages.disclaimer}</footer>
      {tracked !== undefined && (
        <ReferralBeacon token={tracked} doi={page.chosen.doi} campaign={props.campaign} />
      )}
    </main>
  );
}
