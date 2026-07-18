# DashPilot Implementation Log

This file is cumulative. Add a new entry for every implementation or baseline task.

## Entry Template

```md
## YYYY-MM-DD - prompt-id

Commit:

Objective:

Files changed:

Architecture notes:

Validation:

Known failures:

Migrations/env vars:

Security/privacy notes:

Debt remaining:
```

## 2026-07-15 - baseline-2026-07-15

Commit: `chore: establish verified project baseline`

Objective:

- Create a reproducible baseline of the real DashPilot repository before functional changes.
- Inspect `app`, `components`, `lib`, `types`, `supabase`, `tests`, `docs`, and project configuration.
- Run clean install, typecheck, current lint script, tests, build, and audit.

Files changed:

- `docs/current-architecture.md`
- `docs/implementation-log.md`
- `docs/known-gaps.md`

Architecture notes:

- DashPilot is a Next App Router SaaS MVP with local-first persistence.
- Supabase Auth/Database/Storage/RPC are optional and enabled by public Supabase env vars plus an authenticated user.
- File import, profiling, semantic inference, dashboard generation, querying, Copilot, presentation, sharing, and export are implemented in local modules under `lib`.
- The `DashboardSpec` remains the central product contract.
- `lint` currently runs TypeScript only and duplicates `typecheck`.

Validation:

- `git status --short --branch`: clean before edits.
- `node -v`: `v24.14.0`.
- `npm.cmd -v`: `11.9.0`.
- `npm.cmd ci`: passed after sandbox escalation; installed 211 packages; npm reported 3 vulnerabilities.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed, but only executes `tsc --noEmit`.
- `npm.cmd run test`: passed, 21 files and 134 tests.
- `npm.cmd run build`: passed, Next 16.2.10/Turbopack, 23 app routes generated.
- `npm.cmd audit`: exited 1 with advisories for `postcss` through `next` and `xlsx`.

Known failures:

- `npm -v` through PowerShell failed because `npm.ps1` execution is disabled by system policy. Use `npm.cmd`.
- First sandboxed `npm.cmd ci` failed with `EPERM` reading the global npm cache in `AppData`; the same command passed outside the sandbox.
- `npm.cmd audit` reports 2 moderate and 1 high vulnerability.
- Git emits permission warnings for `C:\Users\Cristián\.config\git\ignore`.

Migrations/env vars:

- No migrations changed.
- No env vars changed.
- Inventory verified in `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `AI_API_KEY`, `AI_MODEL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_ID`.

Security/privacy notes:

- `SUPABASE_SERVICE_ROLE_KEY` is documented but not referenced in app code.
- Public share data is served through an RPC, not broad direct public table reads.
- Known gaps include placeholder Supabase types, incomplete audit usage, and export/share hardening needs.

Debt remaining:

- See `docs/known-gaps.md`.

## 2026-07-15 - quality-gates-2026-07-15

Commit: `chore: add production quality gates`

Objective:

- Add production-grade quality gates for lint, typecheck, tests, coverage, build, and dependency audit.
- Pin Node/npm expectations and root dependency versions.
- Add CI and conservative dependency update automation.

Files changed:

- `.github/workflows/quality-gates.yml`
- `.github/dependabot.yml`
- `.nvmrc`
- `.node-version`
- `eslint.config.mjs`
- `package.json`
- `package-lock.json`
- `docs/dependency-management.md`
- `docs/current-architecture.md`
- `docs/implementation-log.md`
- `docs/known-gaps.md`
- Small lint-driven cleanup in dashboard/data/settings/auth/semantic/type placeholder files.

Architecture notes:

- `lint` now runs real ESLint with Next core web vitals and TypeScript rules.
- `typecheck` remains a separate `tsc --noEmit` gate.
- Root dependencies were pinned from the existing lockfile rather than upgraded blindly.
- CI uses `npm ci` with npm cache keyed by `package-lock.json`, preserving reproducible installs while avoiding dependency install drift.
- `audit:ci` blocks critical vulnerabilities. Known non-critical advisories remain documented in `docs/dependency-management.md`.

Validation:

- `npm.cmd ci`: passed outside sandbox after local npm cache `EPERM` in sandbox; installed 523 packages.
- `npm.cmd run lint`: passed.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run test`: passed, 21 files and 134 tests.
- `npm.cmd run test:coverage`: passed, statements 65.14%, branches 61.08%, functions 68.95%, lines 69.08%.
- `npm.cmd run build`: passed, 23 app routes generated.
- `npm.cmd run audit:ci`: passed outside sandbox; no critical vulnerabilities reported.

Known failures:

- Sandboxed `npm.cmd ci` still fails with local npm cache `EPERM` in `AppData`.
- Sandboxed `npm.cmd run audit:ci` failed against the npm audit endpoint/log directory; rerun outside sandbox passed.
- Full `npm audit` still reports `xlsx` high and `postcss` moderate advisories.

Migrations/env vars:

- No database migrations changed.
- No runtime environment variables changed.
- Node is now pinned to `24.14.0`.

Security/privacy notes:

- Critical dependency vulnerabilities block CI.
- The current `xlsx@0.18.5` high-severity advisory is documented as a temporary exception with review date in `docs/dependency-management.md`.

Debt remaining:

- Add coverage thresholds after agreeing on initial minimums.
- Replace or sandbox `xlsx` before production uploads for untrusted tenants.
- Configure GitHub branch protection so the quality gate check is required before merge.

## 2026-07-16 - query-engine-semantic-calc-2026-07-16

Commit: `fix: make dashboard calculations semantically correct`

Objective:

- Eliminate silently incorrect dashboard calculations in the query engine.
- Preserve real zero while preventing null, empty, invalid, NaN, infinity and non-numeric values from becoming fake zeroes.

Files changed:

- `types/dashboard.ts`
- `lib/query-engine/execute-dashboard-query.ts`
- `lib/dashboard-spec/generate-dashboard-spec.ts`
- `lib/presentation-spec/generate-presentation-spec.ts`
- `components/dashboard/dashboard-renderer.tsx`
- `components/dashboard/data-explorer.tsx`
- `tests/query-engine.test.ts`
- `tests/real-pipeline.test.ts`
- `tests/presentation.test.ts`
- `tests/fixtures/query_semantics_golden.csv`
- `docs/implementation-log.md`

Architecture notes:

- Query results keep backward-compatible `value` fields and add non-enumerable metadata: `result`, `state`, `coverage`, `validCount`, `excludedCount` and structured `warnings`.
- Numeric aggregation policy is explicit in the query engine: sum/avg/min/max use only valid numeric values; count includes all filtered rows; count_distinct excludes null, undefined and empty strings.
- Division by zero in calculated metrics returns an indeterminate null result with a structured warning.
- Dashboard and presentation generation now carry query warnings instead of converting unavailable metrics to zero.

Validation:

- `npm run typecheck`: passed.
- `npm run test -- tests/query-engine.test.ts tests/real-pipeline.test.ts tests/presentation.test.ts tests/dashboard-spec.test.ts tests/dataset-understanding.test.ts`: passed, 5 files and 53 tests.
- `npm run lint`: passed.
- `npm run test`: passed, 21 files and 152 tests.
- `npm run build`: passed, 23 app routes generated.

Known failures:

- `git status` continues to emit permission warnings for `C:\Users\Cristián\.config\git\ignore`.
- DuckDB/SQL reference execution was not added because the project has no DuckDB dependency; tests include a SQL-style independent average reference over the same numeric policy.

Migrations/env vars:

- No database migrations changed.
- No environment variables changed.
- No dependency changes.

Security/privacy notes:

- No client exposure of service-role keys or sensitive rows was introduced.
- Query warnings are aggregate-quality metadata only; they do not include raw row payloads.

Debt remaining:

- Add a real DuckDB/SQL comparison if DashPilot adopts a local analytical engine dependency.
- Consider persisted query-result schema versioning if query outputs are later stored server-side.

## 2026-07-16 - dataset-parsing-normalization-2026-07-16

Commit: `fix: harden dataset parsing and type normalization`

Objective:

- Harden CSV/XLS/XLSX parsing for real business files without silently degrading values.
- Preserve canonical column IDs, parse warnings and auditable normalization samples before dashboard generation.

Files changed:

- `types/dataset.ts`
- `lib/files/parse-cell.ts`
- `lib/files/normalize-columns.ts`
- `lib/files/parse-csv.ts`
- `lib/files/parse-excel.ts`
- `lib/data/parse-values.ts`
- `lib/profiling/profile-dataset.ts`
- `lib/validation/schemas.ts`
- `lib/semantic-layer/infer-semantic-layer.ts`
- `lib/semantic-layer/dataset-catalog.ts`
- `lib/dashboard-spec/chart-planner.ts`
- `components/dataset-preview.tsx`
- `components/dashboard/data-explorer.tsx`
- `tests/files.test.ts`
- `tests/parse-values.test.ts`
- `tests/profiling.test.ts`
- `tests/query-engine.test.ts`
- `tests/data-access.test.ts`
- `tests/fixtures/enterprise_formats_latam.csv`

Architecture notes:

- CSV parsing now disables parser-level dynamic typing and normalizes cells through DashPilot's locale-aware parser.
- Imported percentages normalize to decimal ratios, while raw query-engine parsing remains backward compatible for direct values.
- Ambiguous slash dates are preserved as text with warnings; ISO and unambiguous DD/MM or MM/DD dates normalize deterministically.
- Excel serial dates and datetimes normalize to business date strings without local timezone shifts.
- Column metadata now includes canonical IDs, raw headers, parse summaries, warnings and bounded cell-level parse audit.
- Preview exposes type-correction controls before dashboard generation through the existing column dictionary path.

Validation:

- `npm run typecheck`: passed.
- `npm run test -- tests/files.test.ts tests/profiling.test.ts tests/parse-values.test.ts tests/real-pipeline.test.ts tests/dataset-understanding.test.ts`: passed, 5 files and 32 tests.
- `npm run test`: passed, 21 files and 156 tests.
- `npm run lint`: passed.
- `npm run build`: passed, 23 app routes generated.

Known failures:

- `git status` continues to emit permission warnings for the user-level git ignore file.
- No browser E2E harness exists in the repo; preview behavior is covered by parser/profile tests and build.

Migrations/env vars:

- No database migrations changed.
- No environment variables changed.
- No dependency changes.

Security/privacy notes:

- Excel parsing now limits processed sheets and sheet dimensions to reduce risk from anomalous compressed workbooks.
- Parse audit is bounded to 500 cells and stores only raw/normalized cell samples needed for user review.

Debt remaining:

- Persist parse audit in dedicated database columns/tables if tenant audit requirements expand beyond local parsed payloads.
- Add per-column locale override UI if users need to resolve ambiguous numeric/date conventions manually.

## 2026-07-16 - observable-failures-2026-07-16

Commit: `fix: make persistence and ai failures observable`

Objective:

- Eliminate silent fallbacks that made failed AI and persistence operations look successful.
- Distinguish provider, deterministic, offline/local and degraded execution modes.
- Surface sync states, correlation IDs and actionable errors to users.

Files changed:

- `app/api/copilot/route.ts`
- `app/error.tsx`
- `app/logout/page.tsx`
- `components/app-home.tsx`
- `components/dashboard/dashboard-renderer.tsx`
- `components/dashboard/dashboard-workspace.tsx`
- `components/dataset-preview.tsx`
- `components/generation-page.tsx`
- `components/landing-page.tsx`
- `components/layout/AppShell.tsx`
- `components/presentation/presentation-builder.tsx`
- `components/share-export-page.tsx`
- `components/shared/auth-provider.tsx`
- `lib/ai/action-execution-engine.ts`
- `lib/ai/copilot-client.ts`
- `lib/ai/copilot-service.ts`
- `lib/data-access/index.ts`
- `lib/data-access/outbox.ts`
- `lib/data-access/types.ts`
- `lib/observability/domain-error.ts`
- `lib/observability/modes.ts`
- `lib/store/app-store.ts`
- `tests/observable-failures.test.ts`
- `tests/copilot-service.test.ts`
- `tests/render.test.tsx`
- `docs/implementation-log.md`

Architecture notes:

- AI provider failures now return structured errors instead of deterministic fallback responses.
- Local deterministic Copilot mode is explicit when no provider key is configured.
- Persistence results include `executionMode`, `syncStatus`, `correlationId` and recoverability metadata.
- Supabase failures save local state, enqueue typed outbox payloads and report `degraded` / `retrying`.
- Background chat/version sync failures now update observable store state and outbox.
- App shell warns before unload when pending, retrying, failed or conflict sync states exist.

Validation:

- `npm run typecheck`: passed.
- `npm run test -- tests/observable-failures.test.ts tests/copilot-service.test.ts tests/data-access.test.ts`: passed, 3 files and 39 tests.
- `npm run lint`: passed.
- `npm run test`: passed, 22 files and 163 tests.
- `npm run build`: passed, 23 app routes generated.

Known failures:

- `git status` continues to emit permission warnings for `C:\Users\Cristián\.config\git\ignore`.
- A previously interrupted performance task left unrelated worktree changes; they were not intended for this commit.

Migrations/env vars:

- No database migrations changed.
- No environment variables changed.
- `AI_API_KEY` absence now means explicit deterministic mode; provider failures no longer fall back silently.

Security/privacy notes:

- Correlation IDs are exposed to users; raw provider/Supabase errors are sanitized before display/logging.
- Service-role keys and bearer tokens are redacted from domain error messages.
- Outbox payloads are stored in localStorage and should be treated as tenant-local sensitive state.

Debt remaining:

- Add server-side durable outbox/audit storage before multi-device production sync.
- Add conflict resolution UI if Supabase writes fail because remote state diverged.

## 2026-07-16 - browser-storage-policy-2026-07-16

Commit: `security: stop persisting raw datasets in browser storage`

Objective:

- Prevent enterprise rows, sensitive messages and full specs from remaining indefinitely in unsafe browser storage.
- Keep normal recovery for non-sensitive preferences.
- Make local/demo mode an explicit in-memory sandbox.

Files changed:

- `lib/store/app-store.ts`
- `lib/security/browser-storage.ts`
- `lib/data-access/index.ts`
- `lib/data-access/outbox.ts`
- `lib/supabase/datasets.ts`
- `lib/supabase/dashboards.ts`
- `lib/supabase/presentations.ts`
- `lib/supabase/share-links.ts`
- `app/logout/page.tsx`
- `components/layout/AppShell.tsx`
- `components/shared/auth-provider.tsx`
- `docs/browser-storage-policy.md`
- `tests/browser-storage-security.test.ts`
- `tests/data-access.test.ts`
- `tests/observable-failures.test.ts`
- `docs/implementation-log.md`

Architecture notes:

- Zustand `partialize` now persists only IDs, sync metadata and non-sensitive UI preferences.
- Legacy persisted rows, parsed workbooks, profiles, specs, messages and version history are dropped during migration.
- Local fallback adapters keep raw rows/specs in memory only.
- Persistent outbox storage contains sanitized metadata; sensitive retry payloads exist only in memory for the active session.
- Logout and Supabase user changes purge DashPilot browser state.

Validation:

- `npm run test -- tests/browser-storage-security.test.ts tests/data-access.test.ts tests/observable-failures.test.ts`: passed, 3 files and 17 tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test`: passed, 23 files and 168 tests.
- `npm run build`: passed, 23 app routes generated.

Migrations/env vars:

- No database migrations changed.
- No environment variables changed.
- Browser storage version moved to `3`; unsafe legacy keys are purged on migration/logout.

Debt remaining:

- Add server-side durable retry/audit storage before production multi-device offline support.
- If IndexedDB is introduced later, gate it behind explicit sandbox opt-in with expiry and do not label it as secure enterprise storage.

## 2026-07-16 - capability-alignment-2026-07-16

Commit: `fix: align visible capabilities with real behavior`

Objective:

- Ensure visible CTAs execute real behavior, are clearly beta/partial, or are disabled as future work.
- Remove artificial success for PDF, PNG, PPTX, manifest, password-protected sharing and deterministic flows labeled as AI.
- Keep documentation aligned with the actual MVP capability surface.

Files changed:

- `lib/product/capabilities.ts`
- `components/share-export-page.tsx`
- `components/generation-page.tsx`
- `components/presentation/presentation-builder.tsx`
- `components/layout/AppShell.tsx`
- `components/landing-page.tsx`
- `components/dashboard/dashboard-renderer.tsx`
- `components/dashboard/dashboard-workspace.tsx`
- `components/app-home.tsx`
- `components/dataset-preview.tsx`
- `README.md`
- `PRODUCT.md`
- `tests/capabilities.test.ts`
- `tests/cta-capabilities.test.tsx`
- `docs/implementation-log.md`

Architecture notes:

- `lib/product/capabilities.ts` is the canonical catalog for real, partial, future and disabled capabilities.
- Share/export now exposes real DashboardSpec JSON and dataset CSV downloads, while future static/manifest exports are disabled with explicit explanations.
- Password-protected sharing is not shown as a working client-side security feature until server-side validation exists.
- Deterministic generation, deterministic presentation adjustments and provider-backed Copilot are labeled separately.

Validation:

- `npm run test -- tests/capabilities.test.ts tests/cta-capabilities.test.tsx`: passed, 2 files and 3 tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test`: passed, 25 files and 171 tests.
- `npm run build`: passed, 23 app routes generated.

Migrations/env vars:

- No database migrations changed.
- No environment variables changed.

Debt remaining:

- Implement real PDF/PNG/PPTX rendering pipelines before enabling those CTAs.
- Implement server-side password validation before exposing password-protected share links.
- Replace partial provider Copilot flag with runtime capability discovery if multiple providers are supported.

## 2026-07-16 - e2e-harness-incident-2026-07-16

Symptom:

- The capability alignment gate required browser E2E coverage, but `npm.cmd run test:e2e` failed with `Missing script: "test:e2e"`.
- After adding the runner, `npm.cmd run test` initially tried to execute `tests/e2e/capability-ctas.spec.ts` under Vitest and failed with `Playwright Test did not expect test() to be called here`.

Root cause:

- The phase added component tests for CTA behavior but did not add an executable browser E2E harness.
- The first E2E spec was placed under `tests/e2e`, which matched Vitest's default test discovery until explicitly excluded.
- Playwright also needed an explicit devDependency and installed browser binary to run reproducibly.

Category:

- prueba/configuracion/dependencia/entorno.

Files affected:

- `package.json`
- `package-lock.json`
- `playwright.config.ts`
- `vitest.config.ts`
- `.gitignore`
- `tests/e2e/capability-ctas.spec.ts`
- `docs/implementation-log.md`

Correction applied:

- Added `test:e2e` script backed by Playwright.
- Added `@playwright/test` as an explicit pinned devDependency.
- Added Playwright config with a local sandbox web server and empty public Supabase env vars so demo flows do not redirect to `/login`.
- Added a real Chromium E2E covering demo upload flow, dashboard generation, share/export disabled future CTAs, real JSON/CSV downloads, and presentation navigation.
- Excluded `tests/e2e/**` from Vitest using `configDefaults` so unit/component tests remain unchanged.
- Ignored `playwright-report/` and `test-results/`.
- Installed Playwright Chromium locally for this machine with `npx playwright install chromium`.

Test added:

- `tests/e2e/capability-ctas.spec.ts`

Prevention future:

- Keep browser E2E specs owned by Playwright and excluded from Vitest.
- Require `npm.cmd run test:e2e` in any gate that claims E2E coverage.
- Keep E2E server environment explicit about Supabase/local sandbox mode to avoid accidental auth redirects from developer `.env` files.

Commands executed and validation:

- `git status`: repository was dirty before the incident with unrelated changes in dashboard/data/docs/store/package files.
- `npm run typecheck`: passed before E2E fix.
- `npm run lint`: passed before E2E fix.
- `npm run test`: passed before E2E fix, but no E2E was present.
- `npm run build`: passed before E2E fix.
- `npm.cmd run test:e2e`: failed with `Missing script: "test:e2e"`.
- `npx playwright --version`: reported `Version 1.61.1`.
- `npm.cmd install --save-dev @playwright/test@1.61.1`: passed; 3 packages added.
- `npx playwright install chromium`: passed; Chromium and Chromium headless shell downloaded under the local Playwright cache.
- `npm.cmd run test:e2e` inside sandbox: failed with `spawn EPERM` launching Chromium; rerun outside sandbox was required.
- `npm.cmd run test:e2e` outside sandbox: initially failed because Supabase env redirected `/app/datasets/preview` to `/login`; fixed by explicit local E2E env.
- `npm.cmd run test:e2e` outside sandbox: initially failed because the presentation CTA was a real link for demo data; test was corrected to assert real navigation instead of disabled state.
- `npm.cmd ci` inside sandbox: failed with npm cache `EPERM` in `AppData`; rerun outside sandbox passed, 526 packages installed and 527 audited.
- `npm.cmd install --package-lock-only`: passed, synced the pinned Playwright dependency in `package-lock.json`.
- `npm.cmd run test`: passed after excluding E2E from Vitest, 25 files and 172 tests.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run test`: passed again in the required validation sequence, 25 files and 172 tests.
- `npm.cmd run build`: passed, 23 app routes generated.
- `npm.cmd run test:e2e` outside sandbox: passed, 1 Chromium E2E test.

Limitations:

- `npm.cmd run test:e2e` requires an environment that can launch Chromium. In the managed sandbox it failed with `spawn EPERM`; outside the sandbox it passed.
- Existing npm audit output still reports 3 known vulnerabilities (2 moderate, 1 high), unchanged by this incident.

## 2026-07-16 - dataset-versions-lifecycle-2026-07-16

Commit: `feat: add immutable dataset versions and import lifecycle`

Objective:

- Create a reproducible source of truth for each dataset import.
- Prevent failed or partial imports from contaminating the active dataset version.
- Pin dashboards to the dataset version that powered their figures.

Files changed:

- `types/dataset.ts`
- `types/dashboard.ts`
- `types/supabase.ts`
- `lib/datasets/versioning.ts`
- `lib/validation/schemas.ts`
- `lib/dashboard-spec/generate-dashboard-spec.ts`
- `lib/supabase/datasets.ts`
- `lib/supabase/dashboards.ts`
- `lib/data-access/index.ts`
- `lib/data-access/types.ts`
- `lib/store/app-store.ts`
- `components/landing-page.tsx`
- `components/app-home.tsx`
- `components/generation-page.tsx`
- `supabase/migrations/0003_dataset_versions_lifecycle.sql`
- `tests/dataset-versions.test.ts`
- `tests/dataset-versions-migration.test.ts`
- `tests/dashboard-spec.test.ts`
- `README.md`
- `docs/implementation-log.md`

Architecture notes:

- Added immutable `dataset_versions` with checksum, schema hash, version number, row/column counts, status timestamps, profile JSON, storage path and idempotency key.
- Import status is explicit: `created`, `uploading`, `processing`, `validating`, `ready`, `failed`, `cancelled`, `superseded`.
- Dataset rows, columns, sheets, import jobs and dashboards now link to `dataset_version_id`.
- New imports write to a candidate version and activate only after validation reaches `ready`.
- Activation uses `activate_dataset_version(target_dataset_id, target_version_id, expected_active_version_id)` for optimistic concurrency and rollback to a superseded ready version.
- Dashboard persistence normalizes `datasetId` and `datasetVersionId` before saving so historical dashboards can load the same rows/profile later.
- Local mode stores version metadata in memory only, preserving the browser storage policy.

Validation:

- `npm run typecheck`: passed.
- `npm run test -- tests/dataset-versions.test.ts tests/dataset-versions-migration.test.ts tests/data-access.test.ts tests/dashboard-spec.test.ts`: passed, 4 files and 16 tests.
- `npm run test -- tests/dataset-versions.test.ts tests/data-access.test.ts tests/dashboard-spec.test.ts tests/browser-storage-security.test.ts`: passed, 4 files and 19 tests.
- `npm run lint`: passed.
- `npm run test`: passed, 26 files and 179 tests.
- `npm run build`: passed, 23 app routes generated.
- `npm run test:e2e`: failed in sandbox because Chromium launch returned `spawn EPERM`.
- `npm.cmd run test:e2e` outside sandbox: passed, 1 Chromium E2E test.

Known failures:

- PowerShell `npm run test:e2e` failed because `npm.ps1` execution is disabled by system policy; use `npm.cmd`.
- Sandbox Playwright launch failed with `browserType.launch: spawn EPERM`; outside-sandbox rerun passed.
- Git still warns that `C:\Users\Cristián\.config\git\ignore` cannot be read.

Migrations/env vars:

- Added `supabase/migrations/0003_dataset_versions_lifecycle.sql`.
- Existing datasets are backfilled with a legacy `ready` version and `active_version_id`.
- Existing rows, columns, sheets, dashboards and import jobs are backfilled to the active version.
- No environment variables changed.

Security/privacy notes:

- Version checksums and schema hashes are derived from normalized import content and schema, not service keys or tenant secrets.
- Public share RPC now resolves rows/profile through the dashboard's `dataset_version_id`.
- No service-role key or sensitive rows are exposed to the client beyond existing authenticated/local data flows.

Debt remaining:

- Add database-level tests with a real Supabase/Postgres harness to execute RLS, trigger and RPC behavior end to end.
- Consider a server-side import worker before production-scale multi-tenant uploads.
- Add a visible dashboard metadata panel that displays `datasetVersionId`, checksum and activated timestamp for business users.

## 2026-07-16 - public-sharing-aggregated-results-2026-07-16

Commit: `security: redesign public sharing around aggregated results`

Prompt ID: `public-sharing-aggregated-results-2026-07-16`

Objective:

- Redesign public share links so visual authorization is not confused with data security.
- Ensure a normal public link receives dashboard snapshots, not source rows or dataset profiles.
- Validate token, expiration, revocation, password, scopes, filters and downloads server-side.

Changes:

- Added hashed public share tokens and password salts/hashes; newly created links no longer persist recoverable tokens.
- Added public share scopes: `view_dashboard`, `use_filters`, `export_snapshot`.
- Added immutable per-link `share_widget_results` snapshots and `public_share_access_logs`.
- Replaced the public RPC contract so it returns `dashboard`, `viewState`, `widgetResults` and `allowedFilters`, with no `rows` or `profile`.
- Added rate limiting by token hash prefix and hashed client IP, generic denial responses to avoid resource enumeration, immediate revocation checks and filter allowlist validation.
- Replaced the public page renderer with a snapshot renderer that cannot hydrate the private dashboard store with source rows.
- Updated share/export settings so password protection is real server-side behavior and downloads map to aggregated snapshot scope.

Validation:

- `npm run typecheck`: passed.
- `npm run test`: passed, 29 files and 188 tests.
- `npm run lint`: passed.
- `npm run build`: passed, 23 app routes generated.
- `npx playwright test tests/e2e/capability-ctas.spec.ts --reporter=line --timeout=30000`: passed, 1 Chromium E2E test.
- `npx playwright test --reporter=line --timeout=30000`: passed, 1 Chromium E2E test.

Known failures:

- `npm run test:e2e` failed before Playwright because PowerShell blocks `npm.ps1` execution on this machine.
- `npm.cmd run test:e2e` launched Playwright but twice hung after marking an initial `x`; the same full E2E suite completed and passed through `npx playwright test --reporter=line`.
- Git still warns that `C:\Users\Cristián\.config\git\ignore` cannot be read.

Migrations/env vars:

- Added `supabase/migrations/0004_public_share_security.sql`.
- Existing share tokens are backfilled to `token_hash` and the recoverable `token` value is nulled.
- No environment variables changed.

Security/privacy notes:

- Public DevTools payload is intentionally limited to aggregate widget results and allowlisted filters.
- `allowDownload=false` is enforced by absence of `export_snapshot` scope in server response.
- Access logs store link id plus token hash prefix and hashed request metadata, not raw tokens, raw IPs or source rows.

Debt remaining:

- Add executable Supabase/Postgres tests for the security-definer RPC, RLS policies and rate-limit windows.
- Add a first-class public snapshot export endpoint for `export_snapshot` instead of only preparing the scope contract.
- Add owner-facing audit UI for public share access logs and revocation history.

## 2026-07-16 - public-sharing-filters-p1-2026-07-16

Commit: `Enable safe public filters for shared dashboards`

Prompt ID: `public-sharing-filters-p1-2026-07-16`

Symptom:

- The public sharing checkpoint rejected the gate because `allowFilters=true` only rendered a static "Filtros permitidos" list.
- The public page did not send `requested_filters`, so the RPC validation path existed but was not usable.

Root cause:

- The public share contract returned only a base aggregate snapshot and filter metadata.
- There was no persisted mapping from an allowlisted filter request to a precomputed aggregate snapshot revision.

Category:

- Product/security contract mismatch in public sharing.

Correction:

- Public snapshots now include bounded allowed filter values and precomputed aggregate revisions for exact allowlisted filter requests.
- New share links persist `allowed_filters_json`, `share_filter_snapshots` and per-revision `share_widget_results`.
- The public RPC validates filter shape, field, operator, value length, allowed values and disabled-filter access server-side before selecting an exact precomputed revision.
- The public UI renders usable controls, applies one safe allowlisted filter at a time, shows active filter state, handles loading/error states and can clear back to the base snapshot.
- Snapshot persistence rollback remains intact: if filter index or widget result persistence fails, the share link is revoked instead of left partially active.

Files changed:

- `types/dashboard.ts`
- `types/supabase.ts`
- `lib/validation/schemas.ts`
- `lib/share/public-snapshot.ts`
- `lib/supabase/share-links.ts`
- `lib/data-access/index.ts`
- `components/public-share-page.tsx`
- `supabase/migrations/0005_public_share_filters.sql`
- `tests/public-share-page.test.tsx`
- `tests/public-share-security.test.ts`
- `tests/public-share-migration.test.ts`
- `tests/share-links-persistence.test.ts`
- `tests/e2e/capability-ctas.spec.ts`
- `docs/checkpoints/public-sharing-aggregated-results-2026-07-16.md`
- `docs/implementation-log.md`

Validation:

- `npm run typecheck`: passed.
- `npx.cmd vitest run tests/public-share-page.test.tsx tests/public-share-security.test.ts tests/public-share-migration.test.ts tests/share-links-persistence.test.ts tests/share.test.ts tests/data-access.test.ts`: passed, 6 files and 20 tests.
- `npm run lint`: passed.
- `npm run test`: passed, 31 files and 195 tests.
- `npm run build`: passed, 23 app routes generated.
- `npx.cmd playwright test --reporter=line --timeout=45000`: passed, 2 Chromium E2E tests.

Known failures:

- `npm.cmd run test:e2e` still hangs in this Windows/PowerShell environment after reporting immediate `x` markers from the list reporter. The same Playwright suite completed and passed with `npx.cmd playwright test --reporter=line --timeout=45000`.
- Direct `npm run test:e2e` remains blocked by PowerShell script execution policy for `npm.ps1`.
- Git still warns that `C:\Users\Cristián\.config\git\ignore` cannot be read.

Prevention:

- Public filter requests are exact-match snapshots, not query-spec mutations.
- Server-side validation rejects disabled filters, unknown fields, operators outside `eq`/`in`, malformed payloads, more than one public filter, excessive values and values outside `allowed_filters_json`.
- E2E now covers creating a local public share, opening the public link, applying an allowlisted filter and clearing it.

Debt remaining:

- Add executable Supabase/Postgres tests for the 0005 RPC and RLS policies.
- Broaden public filter combinations only if there is a product decision and a bounded precomputation strategy.

## 2026-07-16 - resumable-background-imports-2026-07-16

Commit: `feat: move dataset ingestion to resumable background jobs`

Prompt ID: `resumable-background-imports-2026-07-16`

Objective:

- Move heavy dataset ingestion out of the browser.
- Introduce signed/resumable upload contracts, recoverable import jobs, worker heartbeats, retry, cancellation and dead-letter handling.
- Validate file security before activation and keep a safe preview while processing.

Files changed:

- `types/imports.ts`
- `types/supabase.ts`
- `lib/imports/file-security.ts`
- `lib/imports/scanner.ts`
- `lib/imports/columnar.ts`
- `lib/imports/import-worker.ts`
- `lib/imports/upload-session.ts`
- `lib/imports/schemas.ts`
- `lib/data-access/index.ts`
- `lib/data-access/types.ts`
- `components/landing-page.tsx`
- `components/dataset-preview.tsx`
- `supabase/migrations/0006_resumable_import_jobs.sql`
- `tests/import-file-security.test.ts`
- `tests/import-worker.test.ts`
- `tests/import-jobs-migration.test.ts`
- `tests/e2e/capability-ctas.spec.ts`
- `README.md`
- `docs/implementation-log.md`

Architecture notes:

- Upload now starts as an import job instead of parsing the full file in `LandingPage`.
- The import domain has explicit contracts for resumable upload sessions, safe previews, validation issues, scanner results, progress events and columnar artifacts.
- `ImportWorker` is a modular-monolith worker abstraction with leases, heartbeats, retry scheduling, cancellation and dead-letter state. It is not tied to a short-lived serverless request handler.
- File validation checks extension, declared MIME, detected magic bytes, size, workbook sheet count, compression ratio, macro/encrypted flags and suspicious archive entries.
- Antivirus is represented by a replaceable `MalwareScanner` interface. Tests use deterministic clean/infected scanners.
- Worker activation is delayed until security validation, scan, parsing, profiling, columnar conversion and artifact persistence succeed.
- Columnar output uses `columnar-json` because the repo has no Parquet writer dependency yet; the artifact boundary is isolated so a Parquet adapter can replace it.
- Original-file retention is explicit through `retain_original_private` or `delete_original_after_import` plus optional retention timestamp.

Validation:

- `npm.cmd run typecheck`: passed.
- `npm.cmd run test -- tests/import-file-security.test.ts tests/import-worker.test.ts tests/import-jobs-migration.test.ts`: passed, 3 files and 13 tests.
- `npm.cmd run test`: passed, 34 files and 209 tests.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed, 23 app routes generated.
- `npx.cmd playwright test --reporter=line --timeout=45000`: passed, 3 Chromium E2E tests.

Known failures:

- `where.exe supabase`: Supabase CLI was not installed, so executable local Postgres/RLS migration tests could not be run.
- Git still warns that `C:\Users\CristiÃ¡n\.config\git\ignore` cannot be read.

Migrations/env vars:

- Added `supabase/migrations/0006_resumable_import_jobs.sql`.
- No new environment variables.
- Production deployments need a real long-lived import worker process and configured object-storage/TUS adapter plus antivirus provider.

Security/privacy notes:

- Browser preview reads only bounded header bytes and does not store raw rows in browser persistence.
- Jobs do not set `activeArtifactPath` until the worker completes validation and activation.
- Public/client code still does not import `SUPABASE_SERVICE_ROLE_KEY`.
- Scanner failures and infected files dead-letter before parsing.

Debt remaining:

- Add executable Supabase/Postgres tests for `import_jobs` RLS, queue leasing and migration constraints once Supabase CLI or a database test harness is available.
- Replace `columnar-json` with Parquet when an approved writer/runtime is selected.
- Wire the production object-storage adapter to real TUS/signed upload and run the import worker as a long-lived process in deployment.

## 2026-07-17 - governed-server-side-analytical-query-service-2026-07-17

Commit: `feat: add governed server side analytical query service`

Prompt ID: `governed-server-side-analytical-query-service-2026-07-17`

Objective:

- Avoid downloading all dataset rows to the browser for analytical dashboard rendering.
- Add reproducible allowlisted analytical queries over dataset-version artifacts.
- Keep the existing in-memory engine as a parity reference for small fixtures.

Files changed:

- `types/analytical-query.ts`
- `lib/query-service/schemas.ts`
- `lib/query-service/service.ts`
- `lib/query-service/widgets.ts`
- `tests/analytical-query-service.test.ts`
- `docs/implementation-log.md`

Architecture notes:

- Added a Zod-governed query contract with `datasetVersionId`, metrics, dimensions, filters, time granularity, ordering, limit and offset.
- Introduced `GovernedAnalyticalQueryService` with a replaceable `AnalyticalArtifactRepository` boundary for Parquet or equivalent columnar artifacts.
- The service currently executes through the existing deterministic dashboard query engine after reconstructing server-side rows from a columnar artifact. DuckDB was not added because the repo has no DuckDB/Arrow dependency or native runtime configured; the repository/executor boundary keeps that replacement local.
- Queries are cost-estimated before execution with scan-row, projected-cell, result-limit and estimated-cardinality controls, plus timeout and `AbortSignal` cancellation checks.
- Results include metadata for cache status, coverage, warnings, cost and lineage with a stable query hash.
- Cache keys are version plus stable query hash; invalidation is version-scoped. Recurring low-cardinality queries promote to preaggregations after repeated use.
- Added a widget adapter that converts existing aggregate/table widgets and dashboard filters into governed server-side query contracts without SQL text from the user or LLM.

Validation:

- `npm run test -- tests/analytical-query-service.test.ts`: passed, 10 tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test`: passed, 35 files and 219 tests.
- `npm run build`: passed, 23 app routes generated.
- `npx playwright test --reporter=line --timeout=45000`: passed, 3 Chromium E2E tests.

Known failures:

- Git still warns that `C:\Users\Cristián\.config\git\ignore` cannot be read.

Migrations/env vars:

- No migration added.
- No environment variables added.
- No dependency added, so no clean install was required.

Security/privacy notes:

- Query schemas reject non-normalized identifiers and unknown fields before execution.
- The service never accepts raw SQL from clients or generated text.
- Tenant authorization is enforced at the artifact repository boundary in the in-memory implementation and covered by tests.

Debt remaining:

- Replace the current columnar in-process executor with a DuckDB/Arrow/Parquet adapter once the runtime dependency is approved and benchmarked in this repo.
- Wire the dashboard renderer/data explorer request path to this service-backed contract in the app shell without staging unrelated dirty UI changes.
- Add executable database isolation tests when a persisted artifact repository/RLS-backed query store lands.

## 2026-07-17 - governed-semantic-model-metric-catalog-2026-07-17

Commit: `feat: introduce governed semantic model and metric catalog`

Prompt ID: `governed-semantic-model-metric-catalog-2026-07-17`

Objective:

- Create canonical semantic definitions so users, dashboards and Copilot resolve the same metrics and dimensions.
- Keep existing DashboardSpecs compatible while adding semantic IDs and widget lineage.
- Prevent execution when semantic resolution is ambiguous or below confidence threshold.

Files changed:

- `types/semantic-model.ts`
- `types/dashboard.ts`
- `lib/semantic-model/schemas.ts`
- `lib/semantic-model/model.ts`
- `lib/semantic-model/index.ts`
- `lib/dashboard-spec/generate-dashboard-spec.ts`
- `lib/validation/schemas.ts`
- `tests/semantic-model.test.ts`
- `docs/implementation-log.md`

Architecture notes:

- Added canonical `MetricDefinition`, `DimensionDefinition`, `CalculatedMetric`, `Relationship`, `TimeDimension` and `SemanticModel` contracts.
- Definitions use canonical IDs; names, aliases and source column names are resolution inputs only.
- Metrics carry aggregation, unit, format, null policy, formula, owner, status and description.
- Inferred definitions start as `draft`; `approveSemanticDefinition` marks reviewed definitions as `approved`.
- Dashboard generation now builds a draft semantic model and migrates widgets to include `metricId`, `dimensionIds`, `timeDimensionId` and widget lineage while preserving legacy `field`, `groupBy` and `x.field`.
- Semantic resolution returns candidates, scores and reasons. Low confidence or ambiguity returns `needsClarification` and no selected definition.
- Relationship validation rejects missing dimensions, unvalidated relationships and dangerous `many_to_many` relationships.
- Calculated metric validation detects missing operands and cycles.

Validation:

- `npm run typecheck`: passed.
- `npm run test -- tests/semantic-model.test.ts tests/semantic-layer.test.ts`: passed, 2 files and 11 tests.
- `npm run lint`: passed.
- `npm run test`: passed, 36 files and 228 tests.
- `npm run build`: passed, 23 app routes generated.
- `npx playwright test --reporter=line --timeout=45000`: passed, 3 Chromium E2E tests.

Known failures:

- Git still warns that `C:\Users\Cristián\.config\git\ignore` cannot be read.

Migrations/env vars:

- No SQL migration added.
- No environment variables added.
- No dependency added, so no clean install was required.

Security/privacy notes:

- Copilot-facing semantic resolution cannot select invented metric text like `forecast_ventas`; it asks for clarification unless a canonical definition exists.
- Existing column validation remains in place for Copilot actions, and semantic model validation reports missing source columns after schema changes.

Debt remaining:

- Persist approved semantic models and review workflow when the product adds a stored metric catalog.
- Route provider prompts through canonical semantic IDs rather than only column fields once the UI/store dirty worktree is reconciled.

## 2026-07-17 - dashboard-pages-immutable-revisions-2026-07-17

Commit: `feat: evolve dashboard model to pages and immutable revisions`

Prompt ID: `dashboard-pages-immutable-revisions-2026-07-17`

Objective:

- Evolve dashboard contracts to support pages, history and safe editing without rewriting the renderer.
- Keep v1 `DashboardSpec` readable while introducing v2 documents and immutable published revisions.

Files changed:

- `types/dashboard.ts`
- `lib/dashboard-spec/model-v2.ts`
- `lib/validation/schemas.ts`
- `tests/dashboard-model-v2.test.ts`
- `docs/implementation-log.md`

Architecture notes:

- Added separated contracts for `Dashboard`, `DashboardPage`, `DashboardRevision`, `WidgetSpec` and `WidgetQuery`.
- Added page-level order, title, grid layout and page filters while keeping global filters on `Dashboard` and widget filters on `WidgetQuery`.
- Each revision requires `semanticModelId` and `datasetVersionId`.
- Published revisions are immutable (`mutable: false`) and dashboards point to `publishedRevisionId`.
- Added v1 to v2 migration and v2 to v1 adapter so renderer/editor/presentation can continue consuming legacy `DashboardSpec` during transition.
- `WidgetSpec` separates `query`, `visual`, `content` and `layout`; transient query results such as fallback values and warnings are not migrated into v2 visual config.
- Added target resolution by revision/page/widget IDs so persisted state does not need `selectedTargetSpec` as source of truth.
- Added invariants for unique IDs, existing references, valid 12-column layouts, revision metadata and query-lineage compatibility.

Validation:

- `npm run typecheck`: passed.
- `npm run test -- tests/dashboard-model-v2.test.ts tests/presentation.test.ts tests/dashboard-edit.test.ts`: passed, 3 files and 15 tests.
- `npm run lint`: passed.
- `npm run test`: passed, 37 files and 234 tests.
- `npm run build`: passed, 23 app routes generated.
- `npx playwright test --reporter=line --timeout=45000`: passed, 3 Chromium E2E tests.

Known failures:

- Git still warns that `C:\Users\Cristián\.config\git\ignore` cannot be read.

Migrations/env vars:

- No SQL migration added.
- No environment variables added.
- No dependency added, so no clean install was required.

Debt remaining:

- Persist `DashboardDocument`/`DashboardRevision` in Supabase once the storage migration is introduced.
- Wire store/editor selection state to `DashboardTargetSelection` after the existing dirty UI/store changes are reconciled.

## 2026-07-17 - dashboard-domain-state-side-effects-2026-07-17

Commit: `refactor: separate dashboard domain state and side effects`

Prompt ID: `dashboard-domain-state-side-effects-2026-07-17`

Objective:

- Reduce coupling in the global store and monolithic dashboard state without changing visible behavior.
- Introduce isolated domain slices, commands, queries, hooks and persistence side-effect services that can be adopted incrementally.

Files changed:

- `lib/store/dashboard-domain.ts`
- `lib/store/dashboard-hooks.ts`
- `lib/services/dashboard-side-effects.ts`
- `lib/store/app-store.ts`
- `tests/dashboard-domain-state.test.ts`
- `docs/implementation-log.md`

Current responsibility map:

- Session slice: active project, dataset, dashboard, presentation and sync mode/status.
- Import slice: selected sheet, import warnings and import job reference.
- Dataset metadata slice: profile, uploaded file name and query-service row access metadata; no row arrays.
- Editor slice: dashboard, view state, draft, selection by ID and undo/redo history.
- Copilot slice: messages, thinking state and pending confirmation.
- Presentation slice: presentation spec, options, share settings and saved themes.

Coupling found:

- Legacy `app-store.ts` still owns session, dataset rows, dashboard editor, Copilot, presentation, browser persistence and sync effects in one Zustand store.
- Legacy `selectedTargetSpec` stores object snapshots; the new domain selection uses IDs and clears `selectedTargetSpec`.
- Legacy rows/currentDataset remain in the global store for renderer/data explorer compatibility while the query service rollout continues.
- Prior dirty UI changes already introduce table virtualization and data explorer changes; this refactor did not stage those unrelated hunks.

Architecture notes:

- Added pure dashboard domain commands and queries in `lib/store/dashboard-domain.ts`.
- The pure domain state separates session, import, dataset metadata, editor, Copilot and presentation slices.
- The pure dataset metadata slice stores `rowAccess` and never stores raw rows.
- Added hooks for selection, query state, autosave, history and sync as a migration surface for components.
- Added `DashboardEffectRepository` and `createDashboardEffectRepository` so Copilot chat/dashboard-version persistence is assembled outside reducers/store logic.
- Updated the legacy store's Copilot sync path to use the effect repository instead of directly assembling Supabase/outbox tasks.

Validation:

- `npm run typecheck`: passed.
- `npm run test -- tests/dashboard-domain-state.test.ts tests/dashboard-edit.test.ts tests/presentation.test.ts tests/data-access.test.ts`: passed, 4 files and 21 tests.
- `npm run lint`: passed.
- `npm run test`: passed, 38 files and 241 tests.
- `npm run build`: passed, 23 app routes generated.
- `npx playwright test --reporter=line --timeout=45000`: passed, 3 Chromium E2E tests.

Known failures:

- Git still warns that `C:\Users\Cristián\.config\git\ignore` cannot be read.

Migrations/env vars:

- No SQL migration added.
- No environment variables added.
- No dependency added, so no clean install was required.

Debt remaining:

- Move renderer/data explorer from legacy row arrays to governed query-service results before deleting `rows/currentDataset` from `app-store.ts`.
- Migrate dashboard components to the new hooks after reconciling existing dirty renderer/workspace/data-explorer changes.
- Replace legacy `selectedTargetSpec` writes in `app-store.ts` once every component can resolve selected targets from IDs.

## 2026-07-17 - dashboard-foundation-p1-query-service-remediation-2026-07-17

Commit: `Route dashboard rendering through query service`

Prompt ID: `dashboard-foundation-p1-query-service-remediation-2026-07-17`

Objective:

- Correct only the open P1 defects from `docs/checkpoints/dashboard-foundation-phase-2026-07-17.md`.
- Route dashboard rendering and Data Explorer through the governed QueryService.
- Remove full dataset rows/currentDataset as production source of truth from the global store.

Files changed:

- `app/api/query/route.ts`
- `components/app-home.tsx`
- `components/dashboard/dashboard-renderer.tsx`
- `components/dashboard/dashboard-workspace.tsx`
- `components/dashboard/data-explorer.tsx`
- `components/dataset-preview.tsx`
- `components/generation-page.tsx`
- `components/layout/AppShell.tsx`
- `components/presentation/presentation-builder.tsx`
- `components/projects-page.tsx`
- `components/share-export-page.tsx`
- `lib/query-service/client.ts`
- `lib/query-service/contract.ts`
- `lib/query-service/schemas.ts`
- `lib/store/app-store.ts`
- `lib/supabase/dashboards.ts`
- `tests/e2e/capability-ctas.spec.ts`
- `tests/query-service-ui-guardrails.test.ts`
- `docs/checkpoints/dashboard-foundation-phase-2026-07-17.md`
- `docs/implementation-log.md`

Architecture notes:

- Added a client QueryService boundary that routes local/demo datasets through the existing governed analytical service and authenticated Supabase datasets through `/api/query`.
- Added a server-side `/api/query` route using the Supabase anon/session client, not service-role credentials, so dashboard widgets and Data Explorer can request aggregate/page results without hydrating full rows in browser state.
- Moved local/demo row access into a queryable in-memory repository outside Zustand. The product store now keeps dataset metadata, preview/import state and IDs, not `rows` or `currentDataset`.
- Renderer widgets, chart builder and Data Explorer now call `executeWidgetQuery`, `executeAggregateQuery` or `executeTableQuery` and render loading/error/empty states from query results.
- Dataset preview and Copilot context use bounded samples only.
- Loosened query field ID parsing to support legacy dashboard column IDs with spaces/punctuation while retaining allowlist validation against the dataset profile and banning control characters.
- Supabase dashboard loading no longer fetches `dataset_rows` into the client payload.

Validation:

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test -- tests/query-service-ui-guardrails.test.ts tests/analytical-query-service.test.ts tests/dashboard-domain-state.test.ts tests/browser-storage-security.test.ts`: passed, 4 files and 25 tests.
- `npm run test -- tests/query-service-ui-guardrails.test.ts tests/analytical-query-service.test.ts`: passed after the legacy column-ID regression fix, 2 files and 14 tests.
- `npm run test`: passed, 39 files and 245 tests.
- `npm run build`: passed, 24 app routes generated including `/api/query`.
- `$env:CI = '1'; npm run test:e2e`: passed, 4 Chromium E2E tests.
- Static guardrail: `rg -n "state\.rows|currentDataset|executeDashboardQuery|queryTableRows|applyDashboardFilters" components lib/store lib/supabase app --glob "*.ts" --glob "*.tsx"` returned no production matches.

Known warnings:

- Git still warns that `C:\Users\CristiÃ¡n\.config\git\ignore` cannot be read.
- Playwright logs existing React duplicate-key warnings for `Tecnologia` and `Hogar`; this was not introduced by the P1 remediation and remains documented debt.

Migrations/env vars:

- No SQL migration added.
- No environment variables added.
- No dependency added, so clean install was not required.

Debt remaining:

- `/api/query` still reconstructs the transitional `columnar-json` artifact server-side from `dataset_rows`; integrating DuckDB/Parquet remains the existing P2 scale item.
- CSV export in local/demo mode reads from the queryable local repository for compatibility; a server-side export endpoint should replace that for Supabase datasets before enterprise rollout.
- Existing duplicate-key warnings in dashboard chart labels should be fixed in a separate non-P1 task.

## 2026-07-18 - copilot-agent-goal-2026-07-18

Commit: `Build governed Copilot command bus`

Prompt ID: `copilot-agent-goal-2026-07-18`

Objective:

- Convert the dashboard AI Copilot into a professional dashboard-editing agent with explicit target selection, typed tools, authorized context, planning, policy gating, dry-run/diff preview, confirmation, atomic execution, audit evidence, undo/redo, and ambiguity/privacy guardrails.

Files changed:

- `components/dashboard/dashboard-renderer.tsx`
- `lib/ai/copilot-service.ts`
- `lib/copilot-command-bus/*`
- `lib/store/app-store.ts`
- `tests/copilot-*.test.ts`
- `tests/copilot-ux.test.tsx`
- `tests/e2e/copilot-agent.spec.ts`
- `tests/render.test.tsx`
- `docs/checkpoints/copilot-agent-goal-2026-07-18.md`
- `docs/implementation-log.md`

Architecture notes:

- Added a closed `copilot-command-bus` layer with typed Zod tool schemas, registry metadata, policy gates, semantic diffs, dry-run execution, transaction execution, audit evidence, and undo/redo helpers.
- Copilot planning now resolves authorized dashboard/dataset/widget context from IDs and dashboard revision instead of trusting client-provided selection text.
- Copilot messages now produce a reviewable plan and diff first; dashboard mutation happens only after the user applies the pending plan.
- Risky tools require an explicit apply step, ambiguous prompts return clarification options, and stale/missing/revoked contexts are rejected.
- Provider context generation now redacts PII-like sample values, bounds samples, marks cell text as untrusted data, and instructs the model not to follow dataset-cell instructions.

Validation:

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test`: passed, 45 files and 260 tests.
- `npm run build`: passed, 24 app routes generated.
- `npx playwright test tests/e2e/copilot-agent.spec.ts --reporter=line --timeout=45000`: passed, 1 Chromium test.
- `npm.cmd run test:e2e`: passed, 5 Chromium tests.

Known warnings:

- `npm run test:e2e` via PowerShell was blocked by local `npm.ps1` execution policy; `npm.cmd run test:e2e` ran the same script successfully.
- Playwright still logs existing React duplicate-key warnings for `Tecnologia` and `Hogar`.
- Next still logs the existing smooth-scroll route-transition warning.

Migrations/env vars:

- No SQL migration added.
- No environment variables added.
- No dependency added, so clean install was not required.

Debt remaining:

- Transaction undo/redo is durable through configured dashboard version syncing; local browser-only sessions keep the transaction stack in memory.
- Existing duplicate-key warnings in dashboard chart labels should be fixed separately.
