# SM-01 Monorepo foundations and CI (Phase 1)

## Tasks

- [x] pnpm workspace, Node 24 LTS, ESM, TypeScript 5 strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
- [x] Turborepo pipeline (build, lint, typecheck, test)
- [x] ESLint (typescript-eslint strict, `no-floating-promises`, no `console`), Prettier
- [x] Vitest with coverage (v8), threshold 85% on core packages
- [x] dependency-cruiser rules per "Repository and layering" table
- [x] Husky + lint-staged + commitlint (Conventional Commits)
- [x] GitHub Actions CI: lint, typecheck, test, depcruise
- [x] Changesets, PR template, `.editorconfig`, `.gitignore`

## Exit

`pnpm lint && pnpm typecheck && pnpm test && pnpm depcruise` green locally; CI workflow file valid.
