import {
  doiSchema,
  tokenSchema,
  toolNameSchema,
  type Doi,
  type Token,
  type ToolName,
} from '@scholarly-mcp/core';

/** What a landing link carries (ADR 0025): token, chosen DOI and the tool in `utm_campaign`. */
export interface LandingParams {
  readonly token?: Token;
  readonly doi?: Doi;
  readonly campaign?: ToolName;
}

/** Next.js search params: each key may repeat. */
export type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

/**
 * Reads a landing link's parameters. Anything malformed is dropped rather than refused, so
 * a mangled link still falls back as far as it can: a bad token to the DOI, a bad DOI to
 * the token's first result.
 */
export function parseLandingParams(params: SearchParams): LandingParams {
  const token = tokenSchema.safeParse(first(params['t']));
  const doi = doiSchema.safeParse(first(params['doi']));
  const campaign = toolNameSchema.safeParse(first(params['utm_campaign']));
  return {
    ...(token.success && { token: token.data }),
    ...(doi.success && { doi: doi.data }),
    ...(campaign.success && { campaign: campaign.data }),
  };
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
