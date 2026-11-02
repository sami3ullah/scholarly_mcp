import {
  UNKNOWN_LICENSE,
  activeLicense,
  type Article,
  type ArticleCard,
} from '@scholarly-mcp/core';

/**
 * The access badge on a card, from the record alone, so building a card never waits on an
 * entitlement system (PLAN.md: never block a request on a side system). Open access is
 * `open`; a record with a version-of-record licence in force that is not open is
 * `subscription`; a record without licence information is `unknown`. `check_access` asks
 * the entitlement adapter for a caller-specific answer.
 */
export function cardAccess(article: Article, now: Date): ArticleCard['access'] {
  if (article.isOpenAccess) return 'open';
  return activeLicense(article.licenses, now) === undefined ? 'unknown' : 'subscription';
}

/** The card's licence: the version-of-record licence URL in force, or `unknown`. */
export function cardLicense(article: Article, now: Date): ArticleCard['license'] {
  return activeLicense(article.licenses, now)?.url ?? UNKNOWN_LICENSE;
}
