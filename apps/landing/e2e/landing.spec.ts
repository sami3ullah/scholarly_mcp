import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const STUB = 'http://127.0.0.1:8299';
const LIVE = 'LiveLiveLiveLiveLive01';
const EXPIRED = 'ExpiredExpiredExpired1';
const UTM = 'utm_source=mcp&utm_medium=ai&utm_campaign=search_articles';
const link = (query: string) => `/mcp/landing?${query}`;

async function visits(page: Page): Promise<unknown[]> {
  return (await (await page.request.get(`${STUB}/__visits`)).json()) as unknown[];
}

async function actions(page: Page): Promise<unknown[]> {
  return (await (await page.request.get(`${STUB}/__actions`)).json()) as unknown[];
}

test.beforeEach(async ({ request }) => {
  await request.post(`${STUB}/__reset`);
});

test.describe('a landing link from a search', () => {
  test('opens the clicked article first, then the other results in order', async ({ page }) => {
    await page.goto(link(`t=${LIVE}&doi=10.5555/e2e-2&${UTM}`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Rivaroxaban dosing after falls',
    );
    await expect(
      page.getByText('Your results on Atrial Fibrillation, Anticoagulants'),
    ).toBeVisible();
    const others = page.getByRole('region', { name: 'Other results from your search' });
    await expect(others.getByRole('heading', { level: 3 })).toHaveText([
      'Oral anticoagulation in the very old',
      'Stroke prevention in frail patients',
    ]);
    await expect(page.getByRole('region', { name: 'Where your search matched' })).toContainText(
      'Lower doses were not inferior',
    );
    await expect(
      page.getByRole('link', { name: 'Sign in through your institution' }),
    ).toBeVisible();
  });

  test('opens the first result from the collection link', async ({ page }) => {
    await page.goto(link(`t=${LIVE}&${UTM}`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Oral anticoagulation in the very old',
    );
    await expect(page.getByRole('link', { name: 'Read the full article' })).toHaveAttribute(
      'href',
      'https://publisher.example/article/10.5555/e2e-1',
    );
  });

  test('is noindex with the article page as canonical', async ({ page }) => {
    const response = await page.goto(link(`t=${LIVE}&doi=10.5555/e2e-1&${UTM}`));
    expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex, nofollow',
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      'https://publisher.example/article/10.5555/e2e-1',
    );
    await expect(page).toHaveTitle('Oral anticoagulation in the very old');
  });

  test('speaks the search language', async ({ page }) => {
    await page.goto(link(`t=${LIVE}&doi=10.5555/e2e-3`));
    await expect(page.getByRole('main')).toHaveAttribute('lang', 'de');
    await expect(page.getByText('Weitere Ergebnisse Ihrer Suche')).toBeVisible();
  });
});

test.describe('the referral beacon', () => {
  test('fires once per result, not again on reload or a move to another result', async ({
    page,
  }) => {
    await page.goto(link(`t=${LIVE}&doi=10.5555/e2e-1&${UTM}`));
    await expect
      .poll(() => visits(page))
      .toEqual([{ t: LIVE, doi: '10.5555/e2e-1', tool: 'search_articles' }]);
    await page.reload();
    await page.getByRole('link', { name: 'Rivaroxaban dosing after falls' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Rivaroxaban dosing after falls',
    );
    await page.waitForTimeout(500);
    expect(await visits(page)).toHaveLength(1);
  });

  test('counts a second result opened from the chat', async ({ page }) => {
    await page.goto(link(`t=${LIVE}&doi=10.5555/e2e-1&${UTM}`));
    await expect.poll(() => visits(page)).toHaveLength(1);
    await page.goto(link(`t=${LIVE}&doi=10.5555/e2e-2&${UTM}`));
    await expect
      .poll(() => visits(page))
      .toEqual([
        { t: LIVE, doi: '10.5555/e2e-1', tool: 'search_articles' },
        { t: LIVE, doi: '10.5555/e2e-2', tool: 'search_articles' },
      ]);
  });

  test('never counts a link preview that only fetches the HTML', async ({ page, request }) => {
    const preview = await request.get(link(`t=${LIVE}&doi=10.5555/e2e-1&${UTM}`), {
      headers: { 'user-agent': 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)' },
    });
    expect(preview.status()).toBe(200);
    await page.waitForTimeout(300);
    expect(await visits(page)).toEqual([]);
  });

  test('ignores beacons from preview agents and other sites', async ({ page, request }) => {
    const send = (headers: Record<string, string>) =>
      request.post('/mcp/landing/visit', { data: { t: LIVE, doi: '10.5555/e2e-1' }, headers });
    expect((await send({ 'user-agent': 'facebookexternalhit/1.1' })).status()).toBe(204);
    expect((await send({ 'sec-fetch-site': 'cross-site' })).status()).toBe(204);
    expect((await send({ 'sec-purpose': 'prefetch' })).status()).toBe(204);
    expect(await visits(page)).toEqual([]);
  });

  test('refuses a beacon body that is not a visit', async ({ request }) => {
    const response = await request.post('/mcp/landing/visit', {
      data: { t: LIVE, doi: '10.5555/e2e-1', query: 'Vorhofflimmern' },
    });
    expect(response.status()).toBe(400);
  });
});

test.describe('the action beacon', () => {
  test.beforeEach(async ({ page }) => {
    // The access buttons leave the site; answer them locally so the test stays offline.
    await page.route(/^https:\/\/(doi\.org|publisher\.example)\//, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Publisher</title>' }),
    );
  });

  test('records a click on an access button once per result', async ({ page }) => {
    await page.goto(link(`t=${LIVE}&doi=10.5555/e2e-2&${UTM}`));
    await page.getByRole('link', { name: 'Sign in through your institution' }).click();
    await expect(page).toHaveTitle('Publisher');
    await expect
      .poll(() => actions(page))
      .toEqual([{ t: LIVE, doi: '10.5555/e2e-2', action: 'sign_in' }]);
    await page.goBack();
    await page.getByRole('link', { name: 'Sign in through your institution' }).click();
    await page.waitForTimeout(300);
    expect(await actions(page)).toHaveLength(1);
  });

  test('records nothing once the token has expired', async ({ page }) => {
    await page.goto(link(`t=${EXPIRED}&doi=10.5555/e2e-2&${UTM}`));
    await page.getByRole('link', { name: 'Sign in through your institution' }).click();
    await expect(page).toHaveTitle('Publisher');
    await page.waitForTimeout(300);
    expect(await actions(page)).toEqual([]);
  });

  test('refuses an action it does not know', async ({ request }) => {
    const response = await request.post('/mcp/landing/action', {
      data: { t: LIVE, doi: '10.5555/e2e-1', action: 'subscribe' },
    });
    expect(response.status()).toBe(400);
  });
});

test.describe('falling back', () => {
  test('shows the article alone once the token has expired, and counts nothing', async ({
    page,
  }) => {
    await page.goto(link(`t=${EXPIRED}&doi=10.5555/e2e-2&${UTM}`));
    await expect(
      page.getByText('This link has expired, so only the article is shown.'),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Other results from your search' })).toHaveCount(
      0,
    );
    await page.waitForTimeout(300);
    expect(await visits(page)).toEqual([]);
  });

  test('sends an unknown DOI to doi.org', async ({ request }) => {
    const response = await request.get(link('doi=10.5555/not-indexed'), { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers()['location']).toBe('https://doi.org/10.5555/not-indexed');
  });

  test('answers 404 for a dead link with no DOI to fall back to', async ({ page }) => {
    const response = await page.goto(link(`t=${EXPIRED}`));
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'This link is no longer available',
    );
  });

  test('answers 404 at the root without claiming a link expired', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('There is no article here');
  });
});

test.describe('usability', () => {
  test('has no accessibility violations', async ({ page }) => {
    for (const query of [
      `t=${LIVE}&doi=10.5555/e2e-1`,
      `t=${LIVE}&doi=10.5555/e2e-3`,
      `t=${EXPIRED}`,
    ]) {
      await page.goto(link(query));
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(results.violations, query).toEqual([]);
    }
  });

  test('expands the abstract from the keyboard', async ({ page }) => {
    await page.goto(link(`t=${LIVE}&doi=10.5555/e2e-1`));
    const toggle = page.getByRole('button', { name: 'Show full abstract' });
    await toggle.focus();
    await expect(toggle).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Show less' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Show full abstract' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  test('puts the title and the next step in the first screen', async ({ page }) => {
    await page.goto(link(`t=${LIVE}&doi=10.5555/e2e-2`));
    const height = page.viewportSize()?.height ?? 0;
    for (const target of [
      page.getByRole('heading', { level: 1 }),
      page.getByRole('link', { name: 'Sign in through your institution' }),
    ]) {
      const box = await target.boundingBox();
      expect(box?.y ?? Infinity).toBeLessThan(height);
    }
  });
});
