/** Layering rules from PLAN.md "Repository and layering". */
module.exports = {
  forbidden: [
    {
      name: 'core-is-pure',
      comment:
        'core may import only zod and the standard library, no I/O built-ins (tests may use test tools)',
      severity: 'error',
      from: { path: '^packages/core/src', pathNot: '\\.test\\.ts$' },
      to: {
        dependencyTypesNot: ['local', 'type-only'],
        pathNot: ['node_modules/zod'],
      },
    },
    {
      name: 'core-no-io-builtins',
      severity: 'error',
      from: { path: '^packages/(core|search)/src' },
      to: {
        dependencyTypes: ['core'],
        path: '^(fs|http|https|net|child_process|node:fs|node:http|node:https|node:net|node:child_process)',
      },
    },
    {
      name: 'adapters-only-core',
      comment: 'adapters may import core, never other adapters or apps',
      severity: 'error',
      from: { path: '^packages/(source|store|embedder)-[^/]+/src' },
      to: { path: '^(packages/(source|store|embedder)-|apps/)', pathNot: '^packages/$1' },
    },
    {
      name: 'logger-only-core',
      comment: 'the logger package wraps pino and may import core, never adapters or apps',
      severity: 'error',
      from: { path: '^packages/logger/src' },
      to: { path: '^(packages/(source|store|embedder)-|packages/testkit|apps/)' },
    },
    {
      name: 'http-only-core',
      comment: 'the shared HTTP client may import core, never adapters, testkit or apps',
      severity: 'error',
      from: { path: '^packages/http/src', pathNot: '\\.test\\.ts$' },
      to: { path: '^(packages/(source|store|embedder)-|packages/testkit|apps/)' },
    },
    {
      name: 'search-only-core',
      comment:
        'the search service is core logic in its own package: core and zod only, no adapters, apps or I/O',
      severity: 'error',
      from: { path: '^packages/search/src', pathNot: '\\.test\\.ts$' },
      to: { pathNot: ['^packages/(core|search)/', 'node_modules/zod'] },
    },
    {
      name: 'cite-only-core',
      comment:
        'citations are pure formatting: core, zod and citation-js only, no adapters, apps or testkit',
      severity: 'error',
      from: { path: '^packages/cite/src', pathNot: '\\.test\\.ts$' },
      to: { path: '^(packages/(source|store|embedder|search|logger|http|testkit)|apps/)' },
    },
    {
      name: 'card-view-only-core',
      comment:
        'the MCP Apps card view is browser code built into one page: core types and the MCP Apps SDK only',
      severity: 'error',
      from: { path: '^packages/card-view/src', pathNot: '\\.test\\.ts$' },
      to: { path: '^(packages/(source|store|embedder|search|logger|http|cite|testkit)|apps/)' },
    },
    {
      name: 'testkit-not-apps',
      severity: 'error',
      from: { path: '^packages/testkit' },
      to: { path: '^apps/' },
    },
    {
      name: 'apps-independent',
      severity: 'error',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/', pathNot: '^apps/$1/' },
    },
    {
      name: 'testkit-only-in-tests',
      severity: 'error',
      from: {
        path: '^(apps|packages)/[^/]+/src',
        pathNot: '\\.test\\.tsx?$|^packages/testkit|^apps/landing/src/testing/',
      },
      to: { path: '^packages/testkit' },
    },
    {
      name: 'landing-only-core-and-logger',
      comment:
        'the landing app renders what the landing API returns: core (schemas) and the logger only, never the index, search or adapters',
      severity: 'error',
      from: { path: '^apps/landing/' },
      to: { path: '^packages/', pathNot: '^packages/(core|logger|testkit)/' },
    },
    {
      name: 'landing-client-not-server',
      comment: 'client components and hooks must not import server-only code',
      severity: 'error',
      from: { path: '^apps/landing/src/features/[^/]+/(hooks|model)/' },
      to: { path: '^apps/landing/src/(features/[^/]+/server|shared/lib/env)' },
    },
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(dist|coverage|\\.next)/' },
    tsConfig: { fileName: 'tsconfig.base.json' },
    tsPreCompilationDeps: true,
    combinedDependencies: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'types', 'default'],
    },
  },
};
