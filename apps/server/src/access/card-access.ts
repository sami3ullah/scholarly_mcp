import {
  UNKNOWN_LICENSE,
  activeLicense,
  type Article,
  type ArticleCard,
} from '@scholarly-mcp/core';

/**
 * The access badge on a card, from the record alone, so building a card never waits on an
 * entitlement system (PLAN.md: never block a request on a side system). Open access is
 * `open`; everything else is `subscription`, because a publisher deposits an open licence
 * with every open access article (ADR 0043). `check_access` asks the entitlement adapter,
 * which also knows where to sign in or buy.
 */
export function cardAccess(article: Article): ArticleCard['access'] {
  return article.isOpenAccess ? 'open' : 'subscription';
}

/** The card's licence: the version-of-record licence URL in force, or `unknown`. */
export function cardLicense(article: Article, now: Date): ArticleCard['license'] {
  return activeLicense(article.licenses, now)?.url ?? UNKNOWN_LICENSE;
}
