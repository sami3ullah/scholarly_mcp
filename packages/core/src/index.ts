export { accessStatusSchema, type AccessStatus } from './access/access-status.js';
export { activeLicense } from './article/active-license.js';
export { articleSchema, type Article } from './article/article.js';
export { authorSchema, type Author } from './article/author.js';
export { canonicalDoiSchema, doiSchema, doiUrl, normalizeDoi, type Doi } from './article/doi.js';
export { enrichArticle, withoutFullText } from './article/enrich-article.js';
export { fullTextRefSchema, type FullTextRef } from './article/full-text-ref.js';
export { hashArticleContent, type ArticleContent } from './article/hash-article-content.js';
export { issnSchema, journalSchema, type Journal } from './article/journal.js';
export { languageSchema, type Language } from './article/language.js';
export { licenseSchema, type License } from './article/license.js';
export {
  datePrecision,
  publishedDateSchema,
  type DatePrecision,
  type PublishedDate,
} from './article/published-date.js';
export { subjectSchema, type Subject } from './article/subject.js';
export {
  TEASER_MAX_LENGTH,
  UNKNOWN_LICENSE,
  articleCardSchema,
  type ArticleCard,
} from './card/article-card.js';
export { articleSections } from './chunk/article-sections.js';
export {
  DEFAULT_CHUNKING,
  chunkDocument,
  embeddingTextOf,
  type ChunkDraft,
  type ChunkSection,
  type ChunkableDocument,
  type ChunkingOptions,
  type CountTokens,
} from './chunk/chunk-document.js';
export {
  chunkOriginSchema,
  chunkSchema,
  chunkSourceSchema,
  isDisplayable,
  type Chunk,
  type ChunkOrigin,
  type ChunkSource,
} from './chunk/chunk.js';
export {
  fullTextLabelSchema,
  fullTextSectionSchema,
  type FullTextLabel,
  type FullTextSection,
} from './chunk/full-text-section.js';
export { parseAbstract, type AbstractSection } from './chunk/parse-abstract.js';
export { splitSentences } from './chunk/split-sentences.js';
export {
  DEFAULT_FULLTEXT_LICENSES,
  fulltextConfigSchema,
  type FulltextConfig,
} from './config/fulltext-config.js';
export {
  API_KEY_PREFIX,
  apiKeyIdSchema,
  apiKeySchema,
  parseApiKey,
  type ApiKey,
  type ApiKeyId,
} from './auth/api-key.js';
export { landingConfigSchema, type LandingConfig } from './config/landing-config.js';
export { storeConfigSchema, type StoreConfig } from './config/store-config.js';
export { parseConfig, type Env } from './config/parse-config.js';
export { appError, isAppError, type AppError, type AppErrorDetails } from './errors/app-error.js';
export { errorCodeSchema, type ErrorCode } from './errors/error-code.js';
export { indexMetaSchema, type IndexMeta } from './indexing/index-meta.js';
export {
  sampleQueryChecks,
  verifyResult,
  type VerifyCheck,
  type VerifyReport,
} from './indexing/verify-report.js';
export { fromJsonWithDates, toJsonWithDates } from './json/json-with-dates.js';
export {
  LANDING_SESSION_TTL_MS,
  landingSessionSchema,
  type LandingSession,
} from './landing/landing-session.js';
export {
  LANDING_AUTHOR_LIMIT,
  LANDING_RELATED_LIMIT,
  LANDING_TOPIC_LIMIT,
  landingAccessSchema,
  landingArticleSchema,
  landingArticleSummarySchema,
  landingPageSchema,
  matchedPassageSchema,
  type LandingAccess,
  type LandingArticle,
  type LandingArticleSummary,
  type LandingPage,
  type MatchedPassage,
} from './landing/landing-page.js';
export { LANDING_PATH, buildLandingUrl, type LandingLink } from './landing/landing-url.js';
export { tokenSchema, type Token } from './landing/token.js';
export {
  JOURNAL_SUBJECT_LIMIT,
  journalSummarySchema,
  type JournalSummary,
} from './journal/journal-summary.js';
export { mergeJournalTallies, type JournalTally } from './journal/merge-journal-tallies.js';
export { toolNameSchema, type ToolName } from './metering/tool-name.js';
export {
  computeFunnel,
  createFunnelCounter,
  type Funnel,
  type FunnelCounter,
  type FunnelClientRow,
  type FunnelDayRow,
  type FunnelJournalRow,
  type FunnelOptions,
  type FunnelSteps,
  type FunnelToolRow,
} from './metering/funnel.js';
export {
  journalCardCountSchema,
  landingActionEventSchema,
  landingActionSchema,
  landingVisitEventSchema,
  toolCallEventSchema,
  usageEventSchema,
  usageStatusSchema,
  type JournalCardCount,
  type LandingAction,
  type LandingActionEvent,
  type LandingVisitEvent,
  type ToolCallEvent,
  type UsageEvent,
  type UsageEventKind,
  type UsageStatus,
} from './metering/usage-event.js';
export { parseWireEvent, toWireEvent, type WireEvent } from './metering/wire-event.js';
export { readUsageEvents } from './metering/read-usage-events.js';
export type { ArticleEnricher, Enrichment } from './ports/article-enricher.js';
export type { ArticleReader } from './ports/article-reader.js';
export type {
  ArticleSearch,
  LexicalQuery,
  RankedChunk,
  SearchFilters,
  VectorQuery,
} from './ports/article-search.js';
export type { ArticleRecord, ArticleWriter } from './ports/article-writer.js';
export type { ApiKeyStore } from './ports/api-key-store.js';
export type { Clock } from './ports/clock.js';
export type { Embedder } from './ports/embedder.js';
export type { AccessDecision, Caller, Entitlements } from './ports/entitlements.js';
export type { IndexReader } from './ports/index-reader.js';
export type {
  BuildKind,
  IndexBuild,
  IndexStorage,
  LiveIndexView,
  VerifyOptions,
} from './ports/index-storage.js';
export type { IndexStore, PurgeCounts } from './ports/index-store.js';
export type { JournalDirectory } from './ports/journal-directory.js';
export type { LogFields, Logger } from './ports/logger.js';
export type { Meter } from './ports/meter.js';
export type { RandomToken } from './ports/random-token.js';
export type { SessionStore } from './ports/session-store.js';
export type { Source, SourcePage, SourceRequest } from './ports/source.js';
export type { SyncStateStore } from './ports/sync-state-store.js';
export type { UsageEventQuery, UsageOutbox } from './ports/usage-outbox.js';
export {
  INCREMENTAL_OVERLAP_MS,
  incrementalWindow,
  type SyncWindow,
} from './sync/incremental-window.js';
export { syncStateSchema, type SyncState } from './sync/sync-state.js';
export { detectLanguage } from './text/detect-language.js';
export { foldText } from './text/fold-text.js';
export { normalizeText } from './text/normalize-text.js';
