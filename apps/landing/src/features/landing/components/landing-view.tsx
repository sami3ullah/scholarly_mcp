import type { LandingPage, Token, ToolName } from '@scholarly-mcp/core';
import { messagesFor } from '../../../shared/lib/messages';
import { ActionTracker } from './action-tracker';
import { ChosenArticle } from './chosen-article';
import styles from './landing-view.module.css';
import { MatchList } from './match-list';
import { ReferralBeacon } from './referral-beacon';
import { RelatedReading } from './related-reading';

/**
 * The landing page's layout (PLAN.md React conventions): the chosen article first, then the
 * search's other results and related reading, beside it on wide screens. Layout only; the
 * parts render themselves. The heading names the topic from subjects, never the query.
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
  const heading =
    page.session !== 'active'
      ? messages.articleHeading
      : page.topics.length > 0
        ? messages.resultsOn(page.topics.join(', '))
        : messages.resultsHeading;
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
      <header className={styles['header']}>
        <p className={styles['eyebrow']}>{heading}</p>
        {page.session === 'unavailable' && (
          <p className={styles['notice']}>{messages.expiredNotice}</p>
        )}
      </header>
      <div className={styles['columns']}>
        {tracked === undefined ? (
          chosen
        ) : (
          <ActionTracker token={tracked} doi={page.chosen.doi}>
            {chosen}
          </ActionTracker>
        )}
        <aside className={styles['aside']}>
          <MatchList matches={page.matches} token={props.token} messages={messages} />
          <RelatedReading related={page.related} messages={messages} />
        </aside>
      </div>
      <footer className={styles['footer']}>{messages.disclaimer}</footer>
      {tracked !== undefined && (
        <ReferralBeacon token={tracked} doi={page.chosen.doi} campaign={props.campaign} />
      )}
    </main>
  );
}
