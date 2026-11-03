import type { LandingArticleSummary, Token } from '@scholarly-mcp/core';
import type { Messages } from '../../../shared/lib/messages';
import { landingHref } from '../model/landing-href';
import { ArticleCard } from './article-card';
import styles from './article-list.module.css';

/** The search's other results, in their original order, each opening its own landing page. */
export function MatchList(props: {
  matches: readonly LandingArticleSummary[];
  token: Token | undefined;
  messages: Pick<Messages, 'otherResults' | 'access' | 'retracted'>;
}) {
  if (props.matches.length === 0) return null;
  return (
    <section className={styles['section']} aria-labelledby="other-results">
      <h2 id="other-results" className={styles['heading']}>
        {props.messages.otherResults}
      </h2>
      <ol className={styles['list']}>
        {props.matches.map((article) => (
          <li key={article.doi}>
            <ArticleCard
              article={article}
              href={landingHref({
                doi: article.doi,
                ...(props.token !== undefined && { token: props.token }),
              })}
              messages={props.messages}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
