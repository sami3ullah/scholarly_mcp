import type { LandingAccess, LandingArticle, MatchedPassage as Passage } from '@scholarly-mcp/core';
import type { Messages } from '../../../shared/lib/messages';
import { Badge } from '../../../shared/ui/badge';
import { formatPublished } from '../model/format-published';
import { AccessBadge } from './access-badge';
import { AccessOptions } from './access-options';
import styles from './chosen-article.module.css';
import { ExpandableAbstract } from './expandable-abstract';
import { MatchedPassage } from './matched-passage';

/**
 * The article the reader clicked, on top (PLAN.md: mobile-first). The access options come
 * right after the byline, so the next step is visible without scrolling on a phone.
 */
export function ChosenArticle(props: {
  article: LandingArticle;
  access: LandingAccess;
  passage: Passage | undefined;
  messages: Messages;
  language: string;
}) {
  const { article, messages } = props;
  const more = article.authorCount - article.authors.length;
  const byline = [...article.authors, ...(more > 0 ? [messages.authorsMore(more)] : [])];
  return (
    <article className={styles['article']} lang={article.language}>
      <div className={styles['badges']}>
        {/* The entitlement decision, so the badge always agrees with the actions below. */}
        <AccessBadge access={props.access.status} labels={messages.access} />
        {article.retracted && <Badge tone="danger">{messages.retracted}</Badge>}
      </div>
      <h1 className={styles['title']}>{article.title}</h1>
      {article.subtitle !== undefined && <p className={styles['subtitle']}>{article.subtitle}</p>}
      {byline.length > 0 && <p className={styles['byline']}>{byline.join(', ')}</p>}
      <p className={styles['source']}>
        {article.journal} · {formatPublished(article.published, props.language)}
      </p>
      {article.retracted && (
        <p className={styles['retracted']} role="alert">
          {messages.retractedNotice}
        </p>
      )}
      <AccessOptions access={props.access} article={article} messages={messages} />
      {props.passage !== undefined && (
        <MatchedPassage passage={props.passage} messages={messages} />
      )}
      <section className={styles['section']} aria-labelledby="abstract">
        <h2 id="abstract" className={styles['heading']}>
          {messages.abstract}
        </h2>
        {article.abstract === undefined ? (
          <p>{messages.noAbstract}</p>
        ) : (
          <ExpandableAbstract
            text={article.abstract}
            showMore={messages.showMore}
            showLess={messages.showLess}
          />
        )}
      </section>
      {article.subjects.length > 0 && (
        <section className={styles['section']} aria-labelledby="subjects">
          <h2 id="subjects" className={styles['heading']}>
            {messages.subjects}
          </h2>
          <ul className={styles['subjects']}>
            {article.subjects.map((subject) => (
              <li key={subject}>
                <Badge>{subject}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
      <dl className={styles['facts']}>
        <dt>DOI</dt>
        <dd>
          <a href={article.doiUrl}>{article.doi}</a>
        </dd>
        <dt>{messages.license}</dt>
        <dd>
          {article.license === 'unknown' ? (
            messages.licenseUnknown
          ) : (
            <a href={article.license}>{article.license}</a>
          )}
        </dd>
      </dl>
    </article>
  );
}
