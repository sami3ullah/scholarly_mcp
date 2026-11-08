import type { Funnel, FunnelOptions } from '@scholarly-mcp/core';

/** What the report says about how it was made, besides the funnel itself. */
export interface FunnelReportContext {
  readonly publisher: string;
  readonly generatedAt: Date;
  readonly filters: FunnelOptions;
  /** Export lines that were not events and were skipped. */
  readonly skippedLines: number;
  /** Where the events came from, such as "the metering export usage.jsonl". */
  readonly source: string;
  /** Set when the page is served live: it reloads itself this often. */
  readonly refreshSeconds?: number;
}

const ACTION_LABELS: Record<string, string> = {
  read: 'Read',
  sign_in: 'Sign in',
  buy: 'Buy',
  view_on_publisher: 'View on publisher',
  check_access: 'Check access',
};

/**
 * The funnel as one self-contained HTML page (ADR 0033): no scripts, fonts or images from
 * elsewhere, light and dark themes, a table behind every chart. It holds counts, journal
 * names only, never query text or tokens.
 */
export function renderFunnelReport(funnel: Funnel, context: FunnelReportContext): string {
  const { totals } = funnel;
  const steps = [
    {
      label: 'Searches',
      unit: 'search',
      value: totals.searches,
      note: 'successful search_articles calls',
    },
    {
      label: 'Cards shown',
      unit: 'card',
      value: totals.cardsShown,
      note: 'cards in successful answers',
    },
    {
      label: 'Landing visits',
      unit: 'visit',
      value: totals.visits,
      note: 'results opened from a link',
    },
    {
      label: 'Next actions',
      unit: 'action',
      value: totals.actions,
      note: 'access buttons clicked',
    },
  ];
  const widest = Math.max(1, ...steps.map((step) => step.value));
  const actionMax = Math.max(1, ...funnel.byAction.map((row) => row.count));

  const body = [
    `<header>
      <h1>Referral funnel</h1>
      <p class="meta">${escape(context.publisher)} · ${escape(periodText(funnel, context.filters))}</p>
      <p class="meta">${count(funnel.events)} events${
        funnel.duplicates > 0 ? `, ${count(funnel.duplicates)} duplicates dropped` : ''
      }${context.skippedLines > 0 ? `, ${count(context.skippedLines)} unreadable lines skipped` : ''} · generated ${escape(context.generatedAt.toISOString().slice(0, 16).replace('T', ' '))} UTC</p>
    </header>`,
    `<section aria-labelledby="kpi"><h2 id="kpi" class="visually-hidden">Totals</h2><div class="kpis">
      ${steps
        .map(
          (step) =>
            `<div class="kpi"><p class="kpi-label">${step.label}</p><p class="kpi-value">${count(step.value)}</p><p class="kpi-note">${step.note}</p></div>`,
        )
        .join('')}
      <div class="kpi"><p class="kpi-label">Click-through</p><p class="kpi-value">${percent(totals.clickThrough)}</p><p class="kpi-note">visits per card shown</p></div>
    </div></section>`,
    `<section aria-labelledby="steps"><h2 id="steps">Funnel</h2>
      <div class="bars" role="img" aria-label="${escape(
        steps.map((step) => `${step.label} ${String(step.value)}`).join(', '),
      )}">
      ${steps
        .map((step, index) => {
          const previous = index === 0 ? undefined : steps[index - 1];
          const conversion =
            previous === undefined || previous.value === 0
              ? ''
              : ` · ${ratio(step.value / previous.value)} per ${previous.unit}`;
          return bar(step.label, step.value, widest, `${count(step.value)}${conversion}`);
        })
        .join('')}
      </div>
    </section>`,
    table(
      'journals',
      'By journal',
      ['Journal', 'Cards shown', 'Visits', 'Click-through', 'Actions'],
      funnel.byJournal.map((row) => [
        escape(row.journal),
        count(row.cardsShown),
        count(row.visits),
        rateCell(row.clickThrough),
        count(row.actions),
      ]),
      'Cards and visits per journal. Low click-through means readers saw the cards but did not open them.',
    ),
    `<section aria-labelledby="actions"><h2 id="actions">Next actions</h2>
      <div class="bars" role="img" aria-label="${escape(
        funnel.byAction
          .map((row) => `${ACTION_LABELS[row.action] ?? row.action} ${String(row.count)}`)
          .join(', '),
      )}">
      ${funnel.byAction
        .map((row) =>
          bar(ACTION_LABELS[row.action] ?? row.action, row.count, actionMax, count(row.count)),
        )
        .join('')}
      </div>
    </section>`,
    table(
      'tools',
      'By tool',
      ['Tool', 'Calls', 'Failed', 'Cards shown', 'Visits'],
      funnel.byTool.map((row) => [
        `<code>${escape(row.tool)}</code>`,
        count(row.calls),
        count(row.failedCalls),
        count(row.cardsShown),
        count(row.visits),
      ]),
    ),
    table(
      'days',
      'By day (UTC)',
      ['Day', 'Searches', 'Cards shown', 'Visits', 'Actions'],
      funnel.byDay.map((row) => [
        escape(row.day),
        count(row.searches),
        count(row.cardsShown),
        count(row.visits),
        count(row.actions),
      ]),
    ),
    `<footer>Counts (ADR 0033) come from ${escape(context.source)}.${
      context.refreshSeconds === undefined
        ? ''
        : ` The page reloads every ${String(context.refreshSeconds)} s.`
    } Events hold no query text and no landing token.</footer>`,
  ].join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">${
    context.refreshSeconds === undefined
      ? ''
      : `\n<meta http-equiv="refresh" content="${String(context.refreshSeconds)}">`
  }
<title>Referral funnel</title>
<style>${STYLES}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}

function bar(label: string, value: number, widest: number, text: string): string {
  const width = value === 0 ? 0 : Math.max(0.5, (value / widest) * 100);
  return `<div class="bar-row" tabindex="0" data-tip="${escape(`${label}: ${text}`)}">
    <span class="bar-label">${escape(label)}</span>
    <span class="bar-track"><span class="bar" style="width:${width.toFixed(2)}%"></span></span>
    <span class="bar-value">${escape(text)}</span>
  </div>`;
}

function table(
  id: string,
  title: string,
  headings: readonly string[],
  rows: readonly (readonly string[])[],
  caption?: string,
): string {
  const head = headings
    .map((heading, index) => `<th scope="col"${index === 0 ? '' : ' class="num"'}>${heading}</th>`)
    .join('');
  const body =
    rows.length === 0
      ? `<tr><td colspan="${String(headings.length)}" class="empty">No events</td></tr>`
      : rows
          .map(
            (cells) =>
              `<tr>${cells
                .map((cell, index) =>
                  index === 0 ? `<th scope="row">${cell}</th>` : `<td class="num">${cell}</td>`,
                )
                .join('')}</tr>`,
          )
          .join('');
  return `<section aria-labelledby="${id}"><h2 id="${id}">${title}</h2>${
    caption === undefined ? '' : `<p class="caption">${caption}</p>`
  }<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div></section>`;
}

function rateCell(rate: number | undefined): string {
  if (rate === undefined) return '<span class="muted">-</span>';
  const width = Math.min(100, rate * 100);
  return `<span class="rate"><span class="rate-track" aria-hidden="true"><span class="bar" style="width:${width.toFixed(1)}%"></span></span>${percent(rate)}</span>`;
}

function periodText(funnel: Funnel, filters: FunnelOptions): string {
  const day = (date: Date) => date.toISOString().slice(0, 10);
  const from = filters.from ?? funnel.period?.first;
  const to = filters.to ?? funnel.period?.last;
  if (from === undefined || to === undefined) return 'no events';
  return `${day(from)} to ${day(to)}`;
}

function count(value: number): string {
  return value.toLocaleString('en-US');
}

function percent(rate: number | undefined): string {
  return rate === undefined ? '-' : `${(rate * 100).toFixed(1)}%`;
}

function ratio(value: number): string {
  return value >= 10 ? value.toFixed(0) : value.toFixed(2);
}

// All five HTML metacharacters, `&` first, so the output is safe in text and quoted attributes.
function escape(text: string): string {
  // nosemgrep: javascript.audit.detect-replaceall-sanitization.detect-replaceall-sanitization
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const STYLES = `
:root {
  color-scheme: light dark;
  --surface: #fcfcfb;
  --surface-2: #f3f2ef;
  --text-primary: #0b0b0b;
  --text-secondary: #52514e;
  --border: #dedcd6;
  --track: #ebe9e4;
  --accent: #2a78d6;
}
@media (prefers-color-scheme: dark) {
  :root {
    --surface: #1a1a19;
    --surface-2: #242423;
    --text-primary: #f0efec;
    --text-secondary: #c3c2b7;
    --border: #3a3936;
    --track: #2e2e2c;
    --accent: #3987e5;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--surface);
  color: var(--text-primary);
  font: 15px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif;
}
main { max-width: 1040px; margin: 0 auto; padding: 32px 16px 48px; }
h1 { font-size: 28px; margin: 0 0 4px; }
h2 { font-size: 18px; margin: 40px 0 12px; }
.meta, .caption, .kpi-note, footer, .muted { color: var(--text-secondary); }
.meta { margin: 0; font-size: 14px; }
.caption { margin: -4px 0 12px; font-size: 14px; }
code { font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-top: 24px; }
.kpi { background: var(--surface-2); border-radius: 8px; padding: 14px 16px; }
.kpi p { margin: 0; }
.kpi-label { font-size: 13px; color: var(--text-secondary); }
.kpi-value { font-size: 30px; font-weight: 600; font-variant-numeric: tabular-nums; }
.kpi-note { font-size: 12px; }
.bars { display: grid; gap: 10px; }
.bar-row { position: relative; display: grid; grid-template-columns: 150px 1fr 200px; align-items: center; gap: 12px; border-radius: 4px; outline-offset: 2px; }
.bar-label { font-size: 14px; }
.bar-value { font-size: 14px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.bar-track, .rate-track { display: block; height: 14px; background: var(--track); border-radius: 4px; overflow: hidden; }
.bar { display: block; height: 100%; background: var(--accent); border-radius: 0 4px 4px 0; }
.bar-row:hover .bar, .bar-row:focus-visible .bar { filter: brightness(1.12); }
.bar-row[data-tip]:hover::after, .bar-row[data-tip]:focus-visible::after {
  content: attr(data-tip);
  position: absolute; right: 0; top: -30px; z-index: 1;
  padding: 3px 8px; border-radius: 4px; font-size: 13px; white-space: nowrap;
  background: var(--text-primary); color: var(--surface);
}
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { padding: 7px 10px; border-bottom: 1px solid var(--border); text-align: left; }
thead th { font-weight: 600; color: var(--text-secondary); font-size: 13px; }
tbody th { font-weight: 400; }
.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.empty { text-align: center; color: var(--text-secondary); }
.rate { display: inline-flex; align-items: center; gap: 8px; }
.rate-track { width: 64px; height: 8px; }
footer { margin-top: 40px; font-size: 13px; }
@media (max-width: 560px) {
  .bar-row { grid-template-columns: 1fr; gap: 4px; }
}
@media (forced-colors: active) {
  .bar { background: CanvasText; }
}
`;
