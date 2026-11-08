import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { LandingView } from '../../../features/landing/components/landing-view';
import {
  parseLandingParams,
  type SearchParams,
} from '../../../features/landing/model/landing-params';
import { getLandingPage } from '../../../features/landing/server/get-landing-page';

interface Props {
  readonly searchParams: Promise<SearchParams>;
}

/** `noindex` with the article's own page as canonical (ARCHITECTURE.md: no duplicate pages). */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { token, doi } = parseLandingParams(await searchParams);
  const result = await getLandingPage(token, doi);
  if (result.kind !== 'page') return { robots: { index: false, follow: false } };
  const { chosen } = result.page;
  return {
    title: chosen.title,
    robots: { index: false, follow: false },
    alternates: { canonical: chosen.articleUrl },
  };
}

/** A landing link: resolve it, then render the page, go to the DOI, or show not-found. */
export default async function LandingRoute({ searchParams }: Props) {
  const params = parseLandingParams(await searchParams);
  const result = await getLandingPage(params.token, params.doi);
  if (result.kind === 'redirect') redirect(result.url);
  if (result.kind === 'not-found') notFound();
  return <LandingView page={result.page} token={params.token} campaign={params.campaign} />;
}
