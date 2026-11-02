import { createCheckAccessTool } from './check-access.js';
import { createCiteTool } from './cite.js';
import { createFindRelatedTool } from './find-related.js';
import { createGetArticleTool } from './get-article.js';
import { createGetJournalTool } from './get-journal.js';
import { createSearchArticlesTool } from './search-articles.js';
import type { ToolDeps } from './tool-deps.js';
import type { ToolDefinition } from './tool-definition.js';

/** The six tools of the plan, in the order clients list them. */
export function createTools(deps: ToolDeps): ToolDefinition[] {
  return [
    createSearchArticlesTool(deps),
    createGetArticleTool(deps),
    createFindRelatedTool(deps),
    createGetJournalTool(deps),
    createCiteTool(deps),
    createCheckAccessTool(deps),
  ];
}
