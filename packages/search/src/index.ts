export {
  searchConfigSchema,
  searchOptionsFrom,
  type SearchConfig,
} from './config/search-config.js';
export { buildTeaser } from './present/build-teaser.js';
export { QUERY_MAX_LENGTH } from './query/normalize-query.js';
export {
  DEFAULT_SEARCH_OPTIONS,
  MAX_SEARCH_LIMIT,
  createSearchService,
} from './service/create-search-service.js';
export type {
  RelatedRequest,
  RelatedResult,
  SearchHit,
  SearchOptions,
  SearchRequest,
  SearchResult,
  SearchService,
  SearchServiceDeps,
} from './service/search-types.js';
