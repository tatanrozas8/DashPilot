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


## 2026-07-16 - query-engine-semantic-calc-2026-07-16

Commit: fix: make dashboard calculations semantically correct

Objective:

- Eliminate silently incorrect dashboard calculations in the query engine.
- Preserve real zero while preventing null, empty, invalid, NaN, infinity and non-numeric values from becoming fake zeroes.

Files changed:

- types/dashboard.ts
- lib/query-engine/execute-dashboard-query.ts
- lib/dashboard-spec/generate-dashboard-spec.ts
- lib/presentation-spec/generate-presentation-spec.ts
- components/dashboard/dashboard-renderer.tsx
- components/dashboard/data-explorer.tsx
- tests/query-engine.test.ts
- tests/real-pipeline.test.ts
- tests/presentation.test.ts
- tests/fixtures/query_semantics_golden.csv
- docs/implementation-log.md

Architecture notes:

- Query results keep backward-compatible value fields and add non-enumerable metadata: result, state, coverage, validCount, excludedCount and structured warnings.
- Numeric aggregation policy is explicit in the query engine: sum/avg/min/max use only valid numeric values; count includes all filtered rows; count_distinct excludes null, undefined and empty strings.
- Division by zero in calculated metrics returns an indeterminate null result with a structured warning.
- Dashboard and presentation generation now carry query warnings instead of converting unavailable metrics to zero.

Validation:

- npm run typecheck: passed.
- npm run test -- tests/query-engine.test.ts tests/real-pipeline.test.ts tests/presentation.test.ts tests/dashboard-spec.test.ts tests/dataset-understanding.test.ts: passed, 5 files and 53 tests.
- npm run lint: passed.
- npm run test: passed, 21 files and 152 tests.
- npm run build: passed, 23 app routes generated.

Known failures:

- git status continues to emit permission warnings for the user-level git ignore file.
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