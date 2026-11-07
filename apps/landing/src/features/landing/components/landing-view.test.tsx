import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { aLandingPage, aSummary } from '../../../testing/a-landing-page';
import { AccessOptions } from './access-options';
import { COLLAPSE_AFTER_CHARACTERS, ExpandableAbstract } from './expandable-abstract';
import { LandingView } from './landing-view';
import { messagesFor } from '../../../shared/lib/messages';

vi.mock('../hooks/use-referral-beacon', () => ({ useReferralBeacon: vi.fn() }));
const { useReferralBeacon } = await import('../hooks/use-referral-beacon');

const token = 'pSSYWKV6y282qdANYe86LA' as never;
const messages = messagesFor('en');

describe('LandingView', () => {
  it('makes the chosen article the page heading', () => {
    render(<LandingView page={aLandingPage()} token={token} campaign="search_articles" />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Oral anticoagulation in the elderly',
    );
  });

  it('keeps the page on one article: no other results and no topic heading (ADR 0046)', () => {
    render(<LandingView page={aLandingPage()} token={token} campaign={undefined} />);
    expect(screen.queryByText('Rivaroxaban dosing')).toBeNull();
    expect(screen.queryByText(/Your results on/)).toBeNull();
  });

  it('links related reading by DOI alone, since it was not part of the search', () => {
    render(<LandingView page={aLandingPage()} token={token} campaign={undefined} />);
    const related = screen.getByRole('region', { name: 'Related reading' });
    expect(within(related).getByRole('link').getAttribute('href')).toBe(
      '/mcp/landing?doi=10.1055%2Fa-2001',
    );
  });

  it('quotes the matched abstract passage with its section', () => {
    render(<LandingView page={aLandingPage()} token={token} campaign={undefined} />);
    const passage = screen.getByRole('region', { name: 'Where your search matched' });
    expect(within(passage).getByText('Lower doses were safe.')).toBeTruthy();
    expect(within(passage).getByText('Results')).toBeTruthy();
  });

  it('names only the section of a full-text match', () => {
    const page = aLandingPage({ matchedPassage: { in: 'fullText', section: 'Methods' } });
    render(<LandingView page={page} token={token} campaign={undefined} />);
    expect(
      screen.getByText('Your search matched the "Methods" section of the full text.'),
    ).toBeTruthy();
  });

  it('sends the beacon only for a live session', () => {
    const page = aLandingPage();
    render(<LandingView page={page} token={token} campaign="find_related" />);
    expect(useReferralBeacon).toHaveBeenLastCalledWith(token, page.chosen.doi, 'find_related');
    vi.mocked(useReferralBeacon).mockClear();
    render(
      <LandingView page={{ ...page, session: 'unavailable' }} token={token} campaign={undefined} />,
    );
    expect(useReferralBeacon).not.toHaveBeenCalled();
  });

  it('shows the article alone with a notice once the link has expired', () => {
    const page = aLandingPage({ session: 'unavailable', matches: [], related: [], topics: [] });
    render(<LandingView page={page} token={token} campaign={undefined} />);
    expect(screen.getByText('This link has expired, so only the article is shown.')).toBeTruthy();
  });

  it('speaks German for a German search', () => {
    render(
      <LandingView page={aLandingPage({ language: 'de' })} token={token} campaign={undefined} />,
    );
    expect(screen.getByRole('main').getAttribute('lang')).toBe('de');
    expect(screen.getByText('Verwandte Artikel')).toBeTruthy();
  });

  it('warns about a retracted article', () => {
    const page = aLandingPage();
    render(
      <LandingView
        page={{ ...page, chosen: { ...page.chosen, retracted: true } }}
        token={token}
        campaign={undefined}
      />,
    );
    expect(screen.getByRole('alert').textContent).toContain('retracted');
  });

  it('shows how many more authors there are', () => {
    render(<LandingView page={aLandingPage()} token={token} campaign={undefined} />);
    expect(screen.getByText('Ada Lovelace, Grace Hopper, and 10 more')).toBeTruthy();
  });

  it('keys list items by DOI, so repeated titles are fine', () => {
    const page = aLandingPage({
      related: [aSummary('10.1055/a-1', 'Same'), aSummary('10.1055/a-2', 'Same')],
    });
    render(<LandingView page={page} token={token} campaign={undefined} />);
    expect(screen.getAllByRole('link', { name: 'Same' })).toHaveLength(2);
  });
});

describe('AccessOptions', () => {
  const article = { articleUrl: 'https://publisher.example/a' };
  const hrefs = () =>
    screen
      .getAllByRole('link')
      .map((link) => [link.textContent, link.getAttribute('href'), link.dataset['action']]);

  it('offers the full article when it is open', () => {
    render(<AccessOptions access={{ status: 'open' }} article={article} messages={messages} />);
    expect(hrefs()).toEqual([['Read the full article', 'https://publisher.example/a', 'read']]);
  });

  it('offers sign-in, purchase and the publisher page for a paywalled article', () => {
    render(
      <AccessOptions
        access={{
          status: 'subscription',
          loginUrl: 'https://idp.example/login',
          purchaseUrl: 'https://shop.example/buy',
        }}
        article={article}
        messages={messages}
      />,
    );
    expect(hrefs()).toEqual([
      ['Sign in through your institution', 'https://idp.example/login', 'sign_in'],
      ['Buy this article', 'https://shop.example/buy', 'buy'],
      ["View on the publisher's site", 'https://publisher.example/a', 'view_on_publisher'],
    ]);
  });

  it.each([
    ['institution', 'Read via your institution', 'read'],
    ['unknown', "Check access on the publisher's site", 'check_access'],
  ] as const)('offers one action for %s access', (status, label, action) => {
    render(<AccessOptions access={{ status }} article={article} messages={messages} />);
    expect(hrefs()).toEqual([[label, 'https://publisher.example/a', action]]);
  });
});

describe('ExpandableAbstract', () => {
  const long = 'Results: lower doses. '.repeat(Math.ceil(COLLAPSE_AFTER_CHARACTERS / 20));

  it('shows a short abstract whole, without a toggle', () => {
    render(<ExpandableAbstract text="Short." showMore="More" showLess="Less" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('collapses a long abstract and expands it from the keyboard; Esc collapses', async () => {
    const user = userEvent.setup();
    render(<ExpandableAbstract text={long} showMore="More" showLess="Less" />);
    const toggle = screen.getByRole('button', { name: 'More' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await user.tab();
    await user.keyboard('{Enter}');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent).toBe('Less');
    await user.keyboard('{Escape}');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps paragraphs apart', () => {
    const { container } = render(
      <ExpandableAbstract text={'One.\n\nTwo.'} showMore="More" showLess="Less" />,
    );
    expect(container.querySelectorAll('p')).toHaveLength(2);
  });
});
