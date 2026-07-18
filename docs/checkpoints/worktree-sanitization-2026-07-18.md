# Worktree sanitization checkpoint - 2026-07-18

## Gate

Status: approved.

The worktree was sanitized without implementing new product scope. Pending files were split into isolated, validated commits, and one unsafe pre-goal experiment was preserved in a named stash.

## Initial state

- Branch: `main`
- Initial relation to remote: `main...origin/main`
- Initial pending files:
  - `components/settings-page.tsx`
  - `docs/current-architecture.md`
  - `docs/known-gaps.md`
  - `docs/supabase-setup.md`
  - `lib/query-engine/search.ts`
  - `lib/semantic-layer/column-resolver.ts`
  - `.github/`
  - `.node-version`
  - `.nvmrc`
  - `docs/dependency-management.md`
  - `eslint.config.mjs`

## Classification

| Path | Classification | Decision |
| --- | --- | --- |
| `.github/` | Tooling/configuration requiring validation | Committed separately after quality gates |
| `.node-version` | Tooling/configuration requiring validation | Committed separately after quality gates |
| `.nvmrc` | Tooling/configuration requiring validation | Committed separately after quality gates |
| `eslint.config.mjs` | Tooling/configuration requiring validation | Committed separately after lint/type/build/test validation |
| `docs/dependency-management.md` | Documentation requiring review | Committed with dependency governance docs |
| `docs/current-architecture.md` | Documentation requiring review | Committed with updated architecture/gate evidence |
| `docs/known-gaps.md` | Documentation requiring review | Committed with updated gap status |
| `docs/supabase-setup.md` | Documentation requiring review | Committed with current verification commands |
| `lib/query-engine/search.ts` | Useful validated query-engine change | Committed separately with targeted tests |
| `lib/semantic-layer/column-resolver.ts` | Useful validated semantic-layer cleanup | Committed separately with targeted tests |
| `components/settings-page.tsx` | Risky existing change, then validated fix | Unsafe pre-goal attempt stashed; validated replacement committed separately |
| `tests/query-engine.test.ts` | Test coverage for query-engine behavior | Committed with query/semantic package |
| `tests/settings-page.test.tsx` | Test coverage for settings persistence | Committed with settings UX package |
| `next-env.d.ts` | Generated artifact churn from Next build/E2E | Restored; not committed |
| `.next`, `node_modules`, `coverage`, `test-results`, `playwright-report` | Generated or discardable artifacts | Not tracked; not committed |

## Commits created

### `394c35c chore: finalize tooling and dependency governance`

Purpose: isolates CI, dependency governance, runtime pinning, ESLint configuration, and related docs.

Files:

- `.github/dependabot.yml`
- `.github/workflows/quality-gates.yml`
- `.node-version`
- `.nvmrc`
- `docs/current-architecture.md`
- `docs/dependency-management.md`
- `docs/known-gaps.md`
- `docs/supabase-setup.md`
- `eslint.config.mjs`

Validation:

- `npm.cmd ci`: passed after elevated rerun; sandbox run hit `EPERM` on npm cache under `AppData\Local\npm-cache`.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run audit:ci`: passed after elevated rerun; no critical vulnerabilities.
- `npm.cmd run test`: passed, 45 files / 260 tests.
- `npm.cmd run test:coverage`: passed; statements 67.16%, branches 60.7%, functions 72.66%, lines 70.75%.
- `npm.cmd run build`: passed; 24/24 static pages generated.
- `npm.cmd run test:e2e`: passed, 5/5.

### `6b068d9 refactor: validate query projection and semantic resolver cleanup`

Purpose: isolates query-engine projection behavior and semantic resolver cleanup.

Files:

- `lib/query-engine/search.ts`
- `lib/semantic-layer/column-resolver.ts`
- `tests/query-engine.test.ts`

Validation:

- Targeted query/semantic/copilot tests: passed, 7 files / 94 tests.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run test`: passed, 45 files / 261 tests.
- `npm.cmd run build`: passed.
- `npm.cmd run test:e2e`: passed, 5/5.

### `698f76c fix: initialize settings preferences without hydration flicker`

Purpose: replaces the unsafe pre-goal settings hydration attempt with a validated `useSyncExternalStore`-based preference reader and regression test.

Files:

- `components/settings-page.tsx`
- `tests/settings-page.test.tsx`

Validation:

- `npm.cmd run test -- tests/settings-page.test.tsx`: passed, 1 file / 1 test.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run test`: passed, 46 files / 262 tests.
- `npm.cmd run build`: passed.

Note: one concurrent `npm.cmd run test` plus `npm.cmd run build` run hit Vitest worker startup/timeouts under resource contention. The test suite was rerun alone and passed.

## Preserved stash

- `stash@{0}: On main: preserve pre-goal unvalidated settings hydration change`

Reason: the original pending `components/settings-page.tsx` change read `localStorage` in a lazy state initializer and was preserved instead of being mixed into a commit because it could create hydration mismatch risk.

Recovery commands, if review is needed later:

```bash
git stash show -p stash@{0}
git stash apply stash@{0}
```

Recommendation: inspect before applying. The validated settings commit supersedes this stash for production behavior.

## Final validation

- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run test`: passed, 46 files / 262 tests.
- `npm.cmd run build`: passed; 24/24 static pages generated.
- `npm.cmd run test:e2e`: passed, 5/5.
- Process check: no live DashPilot `node.exe`, `npm.exe`, `npm.cmd`, or `npx.cmd` processes found after E2E.
- Generated artifact check: `.next`, `node_modules`, `coverage`, `test-results`, and `playwright-report` were not tracked or staged.
- Secret check: no `.env`, `.env.local`, `.env.*.local`, Supabase keys, service role key value, or `AI_API_KEY` value was committed. Documentation contains placeholder variable names only.

## Open risks

P0: none.

P1: none.

P2:

- Browser console warning during E2E: duplicate React keys for `Tecnologia` and `Hogar`.
- Browser console warning during E2E: Next.js smooth-scroll warning during route transition.
- `npm audit` still reports non-critical advisories: moderate `postcss` via `next`, and high `xlsx` with no available fix.
- Git emits a local permission warning for `C:\Users\Cristián\.config\git\ignore`; it did not block status, commits, validation, or push readiness.
- The preserved settings stash remains for audit and should be dropped only after explicit approval.

## Final decision

The repository is ready for the next phase once this checkpoint commit is created and the branch is pushed. The only preserved non-committed state is the documented stash above.
