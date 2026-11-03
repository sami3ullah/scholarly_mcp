#!/usr/bin/env node
// The end-to-end smoke checks (SM-14), run by docker/e2e/smoke.sh against a compose stack on
// the demo index: the HTTP edge, every MCP tool over Streamable HTTP with an API key, and a
// card link through the landing proxy. Plain fetch, so it needs only Node 24 on the host.
//   SMOKE_MCP_URL=http://127.0.0.1:18080 SMOKE_LANDING_URL=http://127.0.0.1:13000 \
//   SMOKE_KEY=smk_… node docker/e2e/smoke.mjs
import assert from 'node:assert/strict';

const mcpBase = required('SMOKE_MCP_URL');
const landingBase = required('SMOKE_LANDING_URL');
const key = required('SMOKE_KEY');

const TOOLS = [
  'search_articles',
  'get_article',
  'find_related',
  'get_journal',
  'cite',
  'check_access',
];
const EVENT_STREAM = 'text/event-stream';

let passed = 0;
async function check(name, run) {
  const started = performance.now();
  try {
    await run();
  } catch (error) {
    process.stderr.write(`FAIL ${name}\n`);
    throw error;
  }
  passed += 1;
  process.stdout.write(`ok   ${name} (${String(Math.round(performance.now() - started))} ms)\n`);
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** A minimal Streamable HTTP client: JSON-RPC over POST, answers as JSON or one SSE event. */
function createMcpClient(url, token) {
  let id = 0;
  let session;
  let protocol;
  const post = async (body) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: `application/json, ${EVENT_STREAM}`,
        ...(session && { 'mcp-session-id': session }),
        ...(protocol && { 'mcp-protocol-version': protocol }),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    session = response.headers.get('mcp-session-id') ?? session;
    return response;
  };
  const request = async (method, params) => {
    id += 1;
    const response = await post({ jsonrpc: '2.0', id, method, params });
    assert.equal(response.status, 200, `${method} answered ${String(response.status)}`);
    const message = await readMessage(response, id);
    assert.equal(message.error, undefined, `${method} failed: ${JSON.stringify(message.error)}`);
    return message.result;
  };
  return {
    async initialize() {
      const result = await request('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'scholarly-mcp-smoke', version: '1.0.0' },
      });
      protocol = result.protocolVersion;
      const notified = await post({ jsonrpc: '2.0', method: 'notifications/initialized' });
      assert.ok(notified.status === 202 || notified.status === 200, 'initialized not accepted');
      return result;
    },
    listTools: () => request('tools/list', {}),
    async callTool(name, args) {
      const result = await request('tools/call', { name, arguments: args });
      assert.notEqual(result.isError, true, `${name} returned an error: ${textOf(result)}`);
      assert.ok(result.structuredContent, `${name} returned no structured content`);
      return result.structuredContent;
    },
  };
}

async function readMessage(response, id) {
  const type = response.headers.get('content-type') ?? '';
  const text = await response.text();
  if (!type.startsWith(EVENT_STREAM)) return JSON.parse(text);
  for (const event of text.split('\n\n')) {
    const data = event
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice('data:'.length).trim())
      .join('\n');
    if (data === '') continue;
    const message = JSON.parse(data);
    if (message.id === id) return message;
  }
  throw new Error(`No answer to request ${String(id)} in the event stream`);
}

function textOf(result) {
  return (result.content ?? []).map((part) => part.text ?? '').join(' ');
}

/** The card link, pointed at the landing proxy the smoke stack publishes. */
function viaProxy(link) {
  const url = new URL(link);
  return new URL(`${url.pathname}${url.search}`, landingBase);
}

const mcpUrl = new URL('/mcp', mcpBase);

await check('readyz reports ready', async () => {
  const response = await fetch(new URL('/readyz', mcpBase));
  assert.equal(response.status, 200);
});

await check('/mcp refuses a request without a key', async () => {
  const response = await fetch(mcpUrl, { method: 'POST', body: '{}' });
  assert.equal(response.status, 401);
});

await check('the public port hides metrics and the landing API', async () => {
  assert.equal((await fetch(new URL('/metrics', mcpBase))).status, 404);
  assert.equal((await fetch(new URL('/landing/v1/articles/x', mcpBase))).status, 404);
});

const client = createMcpClient(mcpUrl, key);

await check('initialize', async () => {
  const result = await client.initialize();
  assert.equal(typeof result.serverInfo?.name, 'string');
  assert.ok(result.capabilities?.tools, 'no tools capability');
});

await check('tools/list names the six tools', async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((tool) => tool.name),
    TOOLS,
  );
});

let card;
await check('search_articles finds articles', async () => {
  const result = await client.callTool('search_articles', { query: 'surgery outcomes', limit: 3 });
  assert.ok(result.cards.length > 0, 'no cards');
  card = result.cards[0];
  assert.ok(card.teaser.length <= 280, 'teaser longer than 280 characters');
});

let journal;
await check('get_article returns the card and journal', async () => {
  const result = await client.callTool('get_article', { doi: card.doi });
  assert.equal(result.card.doi, card.doi);
  journal = result.journal;
});

await check('find_related returns other articles', async () => {
  const result = await client.callTool('find_related', { doi: card.doi, limit: 3 });
  assert.equal(result.article.doi, card.doi);
  assert.ok(
    result.cards.every((related) => related.doi !== card.doi),
    'the article is related to itself',
  );
});

await check('get_journal finds the journal by ISSN', async () => {
  const issn = journal.issnElectronic ?? journal.issnPrint;
  const result = await client.callTool('get_journal', issn ? { issn } : { query: journal.name });
  assert.ok(result.journals.length > 0, 'no journal');
  assert.ok(result.journals[0].articleCount > 0);
});

await check('cite formats a citation', async () => {
  const result = await client.callTool('cite', { doi: card.doi, style: 'ama' });
  assert.ok(result.citation.length > 0);
  assert.equal(result.style, 'ama');
});

await check('check_access reports a status', async () => {
  const result = await client.callTool('check_access', { doi: card.doi });
  assert.ok(['open', 'institution', 'subscription'].includes(result.status));
});

await check('the card link opens its landing page through the proxy', async () => {
  const response = await fetch(viaProxy(card.url), { redirect: 'manual' });
  assert.equal(response.status, 200, `landing page answered ${String(response.status)}`);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/);
});

await check('an unknown landing link falls back to doi.org', async () => {
  const url = new URL('/mcp/landing', landingBase);
  url.searchParams.set('doi', '10.1055/unknown-0000');
  const response = await fetch(url, { redirect: 'manual' });
  assert.equal(response.status, 307);
  assert.match(response.headers.get('location') ?? '', /^https:\/\/doi\.org\//);
});

process.stdout.write(`${String(passed)} checks passed\n`);
