# Dependency Management And Rollback

Date: 2026-07-15
Prompt ID: quality-gates-2026-07-15

## Policy

- Root dependencies are pinned to exact versions from `package-lock.json`.
- `npm ci` is the only supported clean-install command for CI and release verification.
- Node is pinned to `24.14.0` through `.nvmrc`, `.node-version`, `engines`, and GitHub Actions.
- npm is pinned through `packageManager` and `engines` to the observed `11.9.0` line.
- Major dependency updates are not automated. They require an explicit engineering task, changelog review, local validation, and rollback plan.
- Dependabot is enabled weekly for npm and GitHub Actions minor/patch updates with conservative grouping.

## Quality Gates

Run the local gates before merging dependency or infrastructure changes:

```powershell
npm.cmd ci
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run test:coverage
npm.cmd run build
npm.cmd run audit:ci
```

On macOS/Linux or GitHub Actions, use `npm` instead of `npm.cmd`.

CI runs the same gates on every pull request to `main` and every push to `main`. Configure the repository branch protection rule so the `Install, lint, typecheck, test, build, audit` check is required before merge.

## Audit Policy

- `npm run audit:ci` blocks critical vulnerabilities with `npm audit --audit-level=critical`.
- `npm run audit` remains available for the full audit report and currently exits non-zero because of known moderate/high advisories.
- High vulnerabilities must be triaged before production release even when the CI critical gate passes.

## Current Audit Exception

Temporary exception:

- Package: `xlsx@0.18.5`
- Severity: high
- npm advisories: prototype pollution and ReDoS
- Reason: `npm audit` reports no fixed version.
- Risk area: browser Excel import in `lib/files/parse-excel.ts`.
- Mitigation until replacement: keep the browser MVP upload size limit, avoid server trust in parsed workbook data, and prioritize parser replacement or sandboxing before production hardening.
- Review by: 2026-08-15 or before enabling production uploads for untrusted tenants.

Known moderate advisories:

- `postcss <8.5.10` appears through `next@16.2.10`. `npm audit fix --force` recommends a breaking install path, so this must be handled through a controlled Next patch/minor update rather than a forced fix.

## Dependency Update Procedure

1. Start from a clean tree: `git status --short --branch`.
2. Read the package changelog and security advisory.
3. For patch/minor updates, prefer Dependabot PRs.
4. For manual updates, install exact versions:

```powershell
npm.cmd install --save-exact package-name@x.y.z
```

5. Re-run all quality gates.
6. Review `package.json` and `package-lock.json` diffs together.
7. Update `docs/implementation-log.md` with changed packages, risks, validation, and rollback note.

## Rollback Procedure

1. Revert the dependency commit or restore the previous `package.json` and `package-lock.json`.
2. Run `npm.cmd ci` to reconstruct `node_modules` from the restored lockfile.
3. Re-run lint, typecheck, tests, coverage, build, and audit gate.
4. Document the rollback reason and any remaining exposure in `docs/implementation-log.md`.

## Higher-Risk Changes

Treat these as higher risk and avoid bundling them with unrelated work:

- `next`, `react`, `react-dom`
- `typescript`
- `eslint`, `eslint-config-next`, `@eslint/*`
- `xlsx` or any replacement spreadsheet parser
- Supabase SDK packages
- Tailwind major/minor changes that alter generated CSS behavior
