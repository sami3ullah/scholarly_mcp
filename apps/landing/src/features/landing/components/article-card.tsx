import type { LandingArticleSummary } from '@scholarly-mcp/core';
import { Badge } from '../../../shared/ui/badge';
import type { Messages } from '../../../shared/lib/messages';
import { AccessBadge } from './access-badge';
import styles from './article-card.module.css';

/** One article in the match list or related reading: linked title, metadata and teaser. */
export function ArticleCard(props: {
  article: LandingArticleSummary;
  href: string;
  messages: Pick<Messages, 'access' | 'retracted'>;
}) {
  const { article, messages } = props;
  const meta = [article.journal, String(article.year), article.firstAuthor].filter(Boolean);
  return (
    <article className={styles['card']}>
      <h3 className={styles['title']}>
        <a href={props.href}>{article.title}</a>
      </h3>
      <p className={styles['meta']}>{meta.join(' · ')}</p>
      <div className={styles['badges']}>
        <AccessBadge access={article.access} labels={messages.access} />
        {article.retracted && <Badge tone="danger">{messages.retracted}</Badge>}
      </div>
      {article.teaser !== '' && <p className={styles['teaser']}>{article.teaser}</p>}
    </article>
  );
}
