import type { LandingArticleSummary } from '@scholarly-mcp/core';
import type { Messages } from '../../../shared/lib/messages';
import { landingHref } from '../model/landing-href';
import { ArticleCard } from './article-card';
import styles from './article-list.module.css';

/**
 * Articles close in meaning to the chosen one. They were not search results, so their
 * links open the article by DOI without the search's token.
 */
export function RelatedReading(props: {
  related: readonly LandingArticleSummary[];
  messages: Pick<Messages, 'related' | 'access' | 'retracted'>;
}) {
  if (props.related.length === 0) return null;
  return (
    <section className={styles['section']} aria-labelledby="related-reading">
      <h2 id="related-reading" className={styles['heading']}>
        {props.messages.related}
      </h2>
      <ul className={styles['list']}>
        {props.related.map((article) => (
          <li key={article.doi}>
            <ArticleCard
              article={article}
              href={landingHref({ doi: article.doi })}
              messages={props.messages}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
