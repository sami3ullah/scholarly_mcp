import { accessStatusSchema, canonicalDoiSchema } from '@scholarly-mcp/core';
import { z } from 'zod';
import { findArticle } from './find-article.js';
import type { ToolDeps } from './tool-deps.js';
import { defineTool } from './tool-definition.js';
import { doiInput } from './tool-schemas.js';

const input = z.strictObject({ doi: doiInput });

const output = z.object({
  doi: canonicalDoiSchema,
  status: accessStatusSchema.describe(
    'open: free to read; institution: the reader has access through their institution; subscription: needs a login or purchase',
  ),
  url: z.url().describe("The article's page on the publisher's site"),
  loginUrl: z.url().optional(),
  purchaseUrl: z.url().optional(),
});

const STATUS_TEXT = {
  open: 'Open access: free to read.',
  institution: 'Available through your institution.',
  subscription: 'Needs a subscription: log in or buy access.',
  unknown: 'Access could not be determined.',
};

/** `check_access`: whether an article can be read and where to sign in or buy (PLAN.md tool contracts; mock adapter in the demo). */
export function createCheckAccessTool(deps: ToolDeps) {
  return defineTool({
    name: 'check_access',
    title: 'Check access',
    description: [
      'Check whether the reader can read one article, by DOI: open access, through their institution, or needing a subscription, with the links to log in or buy.',
      'It says nothing about the content; it never returns full text.',
    ].join(' '),
    input,
    output,
    async run({ doi }, { signal }) {
      const article = await findArticle(deps.reader, doi, signal);
      const decision = await deps.entitlements.check(
        { doi: article.doi, isOpenAccess: article.isOpenAccess },
        signal,
      );
      const structured = {
        doi: article.doi,
        status: decision.status,
        url: article.landingUrl,
        ...(decision.loginUrl !== undefined && { loginUrl: decision.loginUrl }),
        ...(decision.purchaseUrl !== undefined && { purchaseUrl: decision.purchaseUrl }),
      };
      const text = [
        STATUS_TEXT[decision.status],
        `Article: ${article.landingUrl}`,
        ...(decision.loginUrl === undefined ? [] : [`Log in: ${decision.loginUrl}`]),
        ...(decision.purchaseUrl === undefined ? [] : [`Buy: ${decision.purchaseUrl}`]),
        deps.notice,
      ].join('\n');
      return { structured, text, resultCount: 1 };
    },
  });
}
