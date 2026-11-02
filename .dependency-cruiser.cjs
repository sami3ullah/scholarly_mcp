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
      from: { path: '^packages/core/src' },
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
      from: { path: '^(apps|packages)/[^/]+/src', pathNot: '\\.test\\.ts$|^packages/testkit' },
      to: { path: '^packages/testkit' },
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
