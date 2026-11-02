# SM-01 Monorepo foundations and CI (Phase 1)

## Tasks
- [ ] pnpm workspace, Node 22, ESM, TypeScript 5 strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
- [ ] Turborepo pipeline (build, lint, typecheck, test)
- [ ] ESLint (typescript-eslint strict, `no-floating-promises`, no `console`), Prettier
- [ ] Vitest with coverage (v8), threshold 85% on core packages
- [ ] dependency-cruiser rules per "Repository and layering" table
- [ ] Husky + lint-staged + commitlint (Conventional Commits)
- [ ] GitHub Actions CI: lint, typecheck, test, depcruise
- [ ] Changesets, PR template, `.editorconfig`, `.gitignore`

## Exit
`pnpm lint && pnpm typecheck && pnpm test && pnpm depcruise` green locally; CI workflow file valid.
