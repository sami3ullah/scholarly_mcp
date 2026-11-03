// A stand-in for the server's landing API (ADR 0032) with synthetic articles, so the
// Playwright suite and Lighthouse run without an index and never publish real content.
// It records beacon visits and actions; tests read them from GET /__visits and
// GET /__actions and clear them with POST /__reset.
import { createServer } from 'node:http';

export const LIVE = 'LiveLiveLiveLiveLive01';
export const EXPIRED = 'ExpiredExpiredExpired1';
const PORT = Number(process.env.STUB_PORT ?? 8299);
const SECRET = process.env.LANDING_API_SECRET;

const LONG_ABSTRACT = [
  'Background: Oral anticoagulation prevents stroke in atrial fibrillation, but older patients carry a higher risk of bleeding, and doses are often reduced without a clear reason.',
  'Methods: We followed 1,200 patients aged 80 years or older for two years in a prospective registry and compared standard with reduced doses.',
  'Results: Lower doses were not inferior in preventing stroke and caused fewer major bleeds. Falls did not change the balance of benefit and harm.',
  'Limitations: The registry was observational, so unmeasured differences between the dose groups may remain; frailty was recorded by clinicians without a standard scale.',
  'Conclusion: Age alone is not a reason to withhold or reduce anticoagulation; kidney function and weight should guide the dose.',
].join('\n\n');

const summary = (doi, title, access = 'subscription') => ({
  doi,
  title,
  journal: 'Journal of Synthetic Cardiology',
  year: 2025,
  firstAuthor: 'Ada Lovelace',
  teaser: `A synthetic teaser for ${title.toLowerCase()}.`,
  access,
  retracted: false,
});

const ARTICLES = {
  '10.5555/e2e-1': summary('10.5555/e2e-1', 'Oral anticoagulation in the very old', 'open'),
  '10.5555/e2e-2': summary('10.5555/e2e-2', 'Rivaroxaban dosing after falls'),
  '10.5555/e2e-3': summary('10.5555/e2e-3', 'Stroke prevention in frail patients'),
  '10.5555/e2e-9': summary('10.5555/e2e-9', 'Left atrial appendage closure'),
};
const RESULTS = ['10.5555/e2e-1', '10.5555/e2e-2', '10.5555/e2e-3'];

function chosen(doi) {
  const base = ARTICLES[doi];
  return {
    ...base,
    authors: ['Ada Lovelace', 'Grace Hopper', 'Katherine Johnson'],
    authorCount: 3,
    published: { year: 2025, month: 9, day: 14 },
    language: 'en',
    abstract: doi === '10.5555/e2e-1' ? LONG_ABSTRACT : 'Results: A short synthetic abstract.',
    subjects: ['Atrial Fibrillation', 'Anticoagulants', 'Aged, 80 and over'],
    license: base.access === 'open' ? 'https://creativecommons.org/licenses/by/4.0/' : 'unknown',
    articleUrl: `https://publisher.example/article/${doi}`,
    doiUrl: `https://doi.org/${doi}`,
  };
}

function page(token, doi) {
  const active = token === LIVE;
  const wanted = doi ?? (active ? RESULTS[0] : undefined);
  if (wanted === undefined || ARTICLES[wanted] === undefined) return undefined;
  const article = chosen(wanted);
  return {
    session: active ? 'active' : token === undefined ? 'none' : 'unavailable',
    language: active && doi === '10.5555/e2e-3' ? 'de' : 'en',
    topics: active ? ['Atrial Fibrillation', 'Anticoagulants'] : [],
    chosen: article,
    access:
      article.access === 'open'
        ? { status: 'open' }
        : {
            status: 'subscription',
            loginUrl: `https://doi.org/${wanted}`,
            purchaseUrl: `https://doi.org/${wanted}`,
          },
    ...(active && {
      matchedPassage: {
        in: 'abstract',
        text: 'Lower doses were not inferior in preventing stroke and caused fewer major bleeds.',
        section: 'Results',
      },
    }),
    matches: active ? RESULTS.filter((each) => each !== wanted).map((each) => ARTICLES[each]) : [],
    related: [ARTICLES['10.5555/e2e-9']],
  };
}

const visits = [];
const actions = [];

const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(body === undefined ? undefined : JSON.stringify(body));
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://stub');
  if (url.pathname === '/__visits') return json(res, 200, visits);
  if (url.pathname === '/__actions') return json(res, 200, actions);
  if (url.pathname === '/__reset') {
    visits.length = 0;
    actions.length = 0;
    return json(res, 204);
  }
  if (SECRET !== undefined && req.headers.authorization !== `Bearer ${SECRET}`) {
    return json(res, 401, { error: 'unauthorized' });
  }
  if (url.pathname === '/landing/v1/page' && req.method === 'GET') {
    const result = page(
      url.searchParams.get('t') ?? undefined,
      url.searchParams.get('doi') ?? undefined,
    );
    return result === undefined ? json(res, 404, { error: 'not_found' }) : json(res, 200, result);
  }
  const recorded = { '/landing/v1/visits': visits, '/landing/v1/actions': actions }[url.pathname];
  if (recorded !== undefined && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      recorded.push(JSON.parse(body));
      json(res, 204);
    });
    return undefined;
  }
  return json(res, 404, { error: 'not_found' });
}).listen(PORT, '127.0.0.1');
