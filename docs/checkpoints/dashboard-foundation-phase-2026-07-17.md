# Checkpoint: dashboard foundation phase - 2026-07-17

Gate status: **approved for P1 remediation**.

P1 remediation update:

- `DP-GATE-001` remediated: dashboard widgets and Data Explorer now use the governed QueryService contract instead of `state.rows` and direct browser query-engine calls.
- `DP-GATE-002` remediated: `lib/store/app-store.ts` no longer exposes `rows` or `currentDataset`; local/demo rows live in a queryable repository outside the global store and preview/Copilot flows use bounded samples.
- Remaining `P2` items below are still debt and are not approved as production scale claims.

Reviewed commits:

- `464bd5d` - `feat: move dataset ingestion to resumable background jobs`
- `e5673a6` - `feat: add governed server side analytical query service`
- `47b5608` - `feat: introduce governed semantic model and metric catalog`
- `d5977ba` - `feat: evolve dashboard model to pages and immutable revisions`
- `ae9524b` - `refactor: separate dashboard domain state and side effects`

Worktree note:

- Review started from `main...origin/main [ahead 5]`.
- Existing unstaged changes were present before this checkpoint in dashboard UI, docs, query/search, semantic resolver and store files. They were not staged for this checkpoint.
- No package files changed in the reviewed commits, so clean dependency installation was not required.
- P1 remediation did not change package files, so clean dependency installation was still not required.

## Verification executed

| Check | Result | Evidence |
| --- | --- | --- |
| Dependency change check | Passed | `git diff --name-only origin/main..HEAD -- package.json package-lock.json` returned no files. |
| Typecheck | Passed | `npm run typecheck` completed with `tsc --noEmit`. |
| Lint | Passed | `npm run lint` completed with `eslint . --max-warnings=0`. |
| Full unit/integration tests | Passed | `npm run test`: 38 files, 241 tests passed. |
| Phase-specific tests | Passed | `npm run test -- tests/import-file-security.test.ts tests/import-worker.test.ts tests/import-jobs-migration.test.ts tests/analytical-query-service.test.ts tests/semantic-model.test.ts tests/semantic-layer.test.ts tests/dashboard-model-v2.test.ts tests/presentation.test.ts tests/dashboard-edit.test.ts tests/dashboard-domain-state.test.ts tests/data-access.test.ts`: 11 files, 61 tests passed. |
| Production build | Passed after cleanup | First attempt failed with `EPERM` unlinking `.next/server/app/app/configuracion...` after a concurrent Playwright run. `.next` was verified inside the workspace and removed as generated build output; rerun `npm run build` passed and generated 23 app routes. |
| E2E regression path | Passed after fresh server | First run reused or observed stale dev artifacts and returned 404 for dataset preview routes. Rerun with `CI=1` to force a fresh Playwright web server passed: 3/3 Chromium tests. |
| Secret exposure sweep | Passed | Static search found `SUPABASE_SERVICE_ROLE_KEY` in docs/env guidance, not newly imported into client code by this phase. |
| Dead/mock/fallback sweep | Partial | Existing demo/local flows remain documented. No new silent catch blocks were found in the phase files, but legacy row-backed UI paths remain active. |

## P1 remediation verification executed

| Check | Result | Evidence |
| --- | --- | --- |
| Dependency change check | Passed | No package files changed; no clean install required. |
| Typecheck | Passed | `npm run typecheck` completed with `tsc --noEmit`. |
| Lint | Passed | `npm run lint` completed with `eslint . --max-warnings=0`. |
| Targeted regression tests | Passed | `npm run test -- tests/query-service-ui-guardrails.test.ts tests/analytical-query-service.test.ts tests/dashboard-domain-state.test.ts tests/browser-storage-security.test.ts`: 4 files, 25 tests passed. |
| Legacy column-ID regression | Passed | `npm run test -- tests/query-service-ui-guardrails.test.ts tests/analytical-query-service.test.ts`: 2 files, 14 tests passed after validating spaces/punctuation in allowlisted legacy column IDs. |
| Full unit/integration tests | Passed | `npm run test`: 39 files, 245 tests passed. |
| Production build | Passed | `npm run build`: generated 24 app routes, including `/api/query`. |
| E2E regression path | Passed | `$env:CI = '1'; npm run test:e2e`: 4/4 Chromium tests passed, including dashboard/Data Explorer QueryService flow. |
| Static row-state guardrail | Passed | `rg -n "state\.rows|currentDataset|executeDashboardQuery|queryTableRows|applyDashboardFilters" components lib/store lib/supabase app --glob "*.ts" --glob "*.tsx"` returned no production matches. |

## Criteria by prompt

### 1. Recoverable background ingestion

| Criterion | Status | Evidence |
| --- | --- | --- |
| UI does not process the full file in the browser | Passed | `README.md` documents signed resumable upload and bounded preview. `tests/e2e/capability-ctas.spec.ts` covers upload starting a recoverable import job and previewing safe sample text. |
| Job can resume or retry | Passed | `tests/import-worker.test.ts` covers idempotent starts, retry from completed stages, stale worker heartbeat reclamation and cancellation. |
| Progress maps to real stages | Passed | `lib/imports/import-worker.ts` updates stages such as validation, scanning, parsing, conversion, persistence and activation; tests assert completed stages. |
| Failure does not leave inconsistent active artifacts | Passed | Worker tests assert cancelled/dead-lettered jobs do not set `activeArtifactPath`; scanner/validation failures dead-letter before activation. |
| Large, damaged, zip bomb and malicious file validation | Passed at unit level | `tests/import-file-security.test.ts` and `tests/import-worker.test.ts` cover size, damaged/magic/MIME checks, compression-ratio issues and infected scanner results. |
| Database/RLS isolation for import jobs | Partial | Migration SQL exists in `supabase/migrations/0006_resumable_import_jobs.sql` and `tests/import-jobs-migration.test.ts` checks key SQL text. No executable Supabase/Postgres isolation harness was available. This is documented debt, not a newly opened P1 because no DB harness exists in repo. |
| Columnar analytical artifact | Partial | The phase introduced a replaceable columnar artifact boundary and `columnar-json`; Parquet remains documented debt pending an approved runtime/writer. |

### 2. Governed server-side analytical query service

| Criterion | Status | Evidence |
| --- | --- | --- |
| Browser does not receive the dataset to render dashboards | Passed after P1 remediation | Renderer and Data Explorer call `executeWidgetQuery`, `executeAggregateQuery` and `executeTableQuery`; static guardrail found no production `state.rows`, `executeDashboardQuery`, `queryTableRows` or `applyDashboardFilters` usage. |
| Identical query on same version is reproducible | Passed | `tests/analytical-query-service.test.ts` asserts stable query hash, version-scoped cache hit/miss and invalidation. |
| Cost limits apply before or during execution | Passed | `tests/analytical-query-service.test.ts` covers high-cardinality rejection, max rows/cells, timeout and cancellation. |
| Existing widgets work through the new contract | Passed after P1 remediation | `tests/query-service-ui-guardrails.test.ts` covers widget/table execution through the QueryService contract; E2E covers dashboard filters and Data Explorer search without query-service errors. |
| No user/LLM free SQL | Passed | Query schemas are allowlisted and service code calls typed query builders, not SQL text. |
| Authorization | Passed at repository boundary | In-memory artifact repository rejects tenant mismatches; covered in analytical query tests. |

### 3. Governed semantic model and metric catalog

| Criterion | Status | Evidence |
| --- | --- | --- |
| Column rename does not silently break widgets | Passed | `tests/semantic-model.test.ts` covers migration to canonical IDs and source column rename. |
| KPI can explain origin, formula, filters and version | Passed at contract level | `types/semantic-model.ts`, `types/dashboard.ts` and semantic migration add canonical IDs and widget lineage. |
| Copilot never executes invented columns | Passed at resolver level | Semantic resolver returns clarification for unknown/low-confidence terms; tests cover ambiguity and invented inputs. |
| Draft/approved/deprecated states exist | Passed | Semantic model types and tests cover definition status and approval. |
| Inferred definitions can be reviewed and approved before official use | Partial | `approveSemanticDefinition` exists and inferred definitions start as draft. No persisted review UI/workflow was added in this phase. |
| Dangerous automatic relationships are blocked | Passed | Tests cover invalid, unapproved and many-to-many relationship rejection. |

### 4. Dashboard pages and immutable revisions

| Criterion | Status | Evidence |
| --- | --- | --- |
| Profitability page can be created without hacks | Passed | `tests/dashboard-model-v2.test.ts` creates and reorders a profitability page with page filters and widget references. |
| Published dashboard points to an immutable revision | Passed at domain level | v2 model validates `publishedRevisionId` and immutable published revisions. |
| Invalid specs are rejected before persistence | Passed | Tests cover broken references, invalid layouts and incompatible queries. |
| Renderer/editor keep working during migration | Passed | Existing dashboard edit/presentation tests, full Vitest, build and Playwright E2E passed. |
| Persisted revision storage and rollback | Partial | v2 document contracts and migration helpers exist, but no Supabase migration persists `DashboardDocument`/`DashboardRevision` yet. This is documented debt. |

### 5. Domain state and side effects separation

| Criterion | Status | Evidence |
| --- | --- | --- |
| Editor test does not initialize whole product | Passed | `tests/dashboard-domain-state.test.ts` edits dashboard state without product store or dataset rows. |
| Presentation changes do not accidentally mutate dataset/dashboard | Passed at new domain slice level | Domain tests cover isolated presentation/theme behavior and undo/cancel flows. |
| External effects are outside pure reducers/store | Passed for new domain modules, partial for legacy store | `lib/store/dashboard-domain.ts` is pure and `lib/services/dashboard-side-effects.ts` moves persistence assembly out of Copilot reducer paths. Legacy `app-store.ts` still owns effects during migration. |
| No duplicated source of truth | Passed after P1 remediation | `tests/query-service-ui-guardrails.test.ts` asserts the product store exposes neither `rows` nor `currentDataset`; local/demo row access is isolated in the QueryService client repository. |
| Rows do not live in the global store once query service exists | Passed after P1 remediation | Same evidence as above; renderer/Data Explorer consume query results and dataset metadata instead of global row arrays. |

## Defects

### DP-GATE-001 - P1 - Dashboard rendering still depends on full client-side rows - Remediated

The governed query service exists, but the active dashboard renderer and data explorer still read `rows` from the global store and execute the previous in-browser query engine. This fails the prompt acceptance criterion that the browser must not receive the dataset to render the dashboard, and it makes server-side query governance optional rather than enforced.

Remediation evidence:

- Dashboard widgets, filters and Data Explorer table/chart queries now route through the QueryService client and `/api/query` server route for authenticated Supabase contexts.
- Browser state keeps dataset metadata plus bounded preview/sample data only.
- Regression evidence: `tests/query-service-ui-guardrails.test.ts`, `$env:CI = '1'; npm run test:e2e`, and the production static guardrail listed above.

### DP-GATE-002 - P1 - Global store still duplicates dataset row state - Remediated

The new pure domain state avoids row arrays, but the production store still contains both `rows` and `currentDataset` and hydrates them through multiple code paths. This fails the store refactor acceptance criteria: rows should not remain in the global store once the query service exists, and there should not be duplicate sources of truth.

Remediation evidence:

- `lib/store/app-store.ts` no longer defines `rows` or `currentDataset`.
- Local/demo full rows are quarantined in the QueryService client repository, outside the persisted/global product store.
- Regression evidence: `tests/query-service-ui-guardrails.test.ts` verifies the store shape and QueryService table/widget execution.

### DP-GATE-003 - P2 - Semantic definition approval is domain-only

Semantic definitions can be drafted and approved in code, but there is no persisted review queue or product workflow for users to approve inferred definitions before they become official.

Mandatory action before production rollout:

- Persist draft and approved semantic models.
- Add review/approval UX or administrative workflow.
- Audit Copilot prompts so they reference canonical semantic IDs end to end.

### DP-GATE-004 - P2 - Analytical artifact execution is not real Parquet/DuckDB yet

The query service has a replaceable artifact repository and test artifacts marked `parquet`, but execution reconstructs server-side rows and reuses the existing in-memory query engine. This is acceptable as a transitional modular-monolith boundary, but it does not yet prove Parquet/DuckDB-scale execution.

Mandatory action before scale claims:

- Select and integrate DuckDB/Arrow/Parquet or document a measured equivalent.
- Add benchmark or integration tests over columnar artifacts.

### DP-GATE-005 - P2 - Dashboard v2 persistence/rollback is not migrated yet

Dashboard v2 contracts and validators exist, but the database still stores legacy dashboard specs/versions. No SQL migration, rollback procedure or persisted revision isolation test exists for v2 documents.

Mandatory action before storing published v2 dashboards:

- Add a persistence migration for dashboard documents/revisions.
- Define rollback/read compatibility.
- Add database isolation tests when the persisted model lands.

## Gate decision

The P1 remediation gate is **approved**. The original blocking P1 defects are closed:

- DP-GATE-001: remediated.
- DP-GATE-002: remediated.

The phase still has P2 debt for semantic approval workflow, real Parquet/DuckDB execution and persisted dashboard v2 revisions. Those items are not waived; they are simply outside this P1-only remediation.
