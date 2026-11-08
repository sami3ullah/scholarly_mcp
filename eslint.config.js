import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/coverage/**', '**/.turbo/**', '**/.next/**'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      'no-console': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ClassDeclaration[superClass]',
          message: 'Composition over inheritance: no extends.',
        },
        { selector: 'ExportDefaultDeclaration', message: 'Named exports only.' },
      ],
    },
  },
  {
    files: ['apps/landing/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, '@next/next': nextPlugin },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // The App Router has no pages directory to check links against.
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  {
    // Next.js finds route files and its config by their default export.
    files: [
      'apps/landing/src/app/**/{page,layout,loading,error,not-found}.tsx',
      'apps/landing/next.config.ts',
      'apps/landing/playwright.config.ts',
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['**/*.{js,cjs,mjs}', '**/*.config.ts'],
    ...tseslint.configs.disableTypeChecked,
    rules: { ...tseslint.configs.disableTypeChecked.rules, 'no-restricted-syntax': 'off' },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { module: 'writable', require: 'readonly' },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: [
      'apps/landing/e2e/**/*.mjs',
      'apps/landing/*.cjs',
      'packages/card-view/scripts/**/*.mjs',
      'docker/**/*.mjs',
    ],
    languageOptions: {
      globals: {
        process: 'readonly',
        URL: 'readonly',
        AbortSignal: 'readonly',
        fetch: 'readonly',
        performance: 'readonly',
      },
    },
  },
  prettier,
);
