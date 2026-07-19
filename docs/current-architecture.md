# DashPilot Current Architecture Baseline

Date: 2026-07-15
Prompt ID: baseline-2026-07-15
Scope: verified local repository baseline before functional changes.

## Verification Environment

- OS shell observed: Windows PowerShell.
- Node: `v24.14.0`.
- npm: `11.9.0` through `npm.cmd`.
- `npm` through PowerShell failed because `C:\Program Files\nodejs\npm.ps1` is blocked by the local execution policy. Use `npm.cmd` on this machine unless the execution policy is changed outside the repo.
- Git status before and after checks: clean `main...origin/main`. Git also warned that `C:\Users\Cristián\.config\git\ignore` could not be read due to permissions.

## Reproducible Commands

Use these commands from the repository root:

```powershell
npm.cmd ci
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run test:coverage
npm.cmd run build
npm.cmd run audit:ci
```

Observed results:

| Command | Result | Relevant output |
| --- | --- | --- |
| `node -v` | Passed | `v24.14.0` |
| `npm.cmd -v` | Passed | `11.9.0` |
| `npm.cmd ci` | Passed after sandbox escalation | `added 526 packages`, `audited 527 packages`, `3 vulnerabilities (2 moderate, 1 high)` |
| `npm.cmd run lint` | Passed | Runs real ESLint via `eslint . --max-warnings=0` |
| `npm.cmd run typecheck` | Passed | Runs `tsc --noEmit` |
| `npm.cmd run test` | Passed | 45 files and 260 tests passed |
| `npm.cmd run test:coverage` | Passed | V8 coverage summary: statements `67.16%`, branches `60.7%`, functions `72.66%`, lines `70.75%` |
| `npm.cmd run build` | Passed | Next `16.2.10` with Turbopack, `24/24` static pages generated |
| `npm.cmd run test:e2e` | Passed after sandbox escalation | 5 Chromium Playwright tests passed |
| `npm.cmd run audit:ci` | Passed after sandbox escalation | Blocks critical vulnerabilities; current report still shows known moderate/high advisories |

The first sandboxed `npm.cmd ci` attempt failed with `EPERM` while reading `C:\Users\Cristián\AppData\Local\npm-cache`. The same command passed outside the sandbox.

## Scripts Inventory

Source: `package.json`.

| Script | Command | Status |
| --- | --- | --- |
| `dev` | `next dev` | Local dev server |
| `build` | `next build` | Verified passing |
| `start` | `next start` | Production server for built app |
| `lint` | `eslint . --max-warnings=0` | Real ESLint gate for Next.js, React, and TypeScript |
| `typecheck` | `tsc --noEmit` | Verified passing |
| `test` | `vitest run` | Verified passing |
| `test:e2e` | `playwright test --reporter=line --timeout=45000` | Verified passing with Chromium |
| `test:coverage` | `vitest run --coverage` | Verified passing with V8 provider |
| `test:watch` | `vitest` | Watch mode, not part of baseline checks |
| `audit` | `npm audit` | Full advisory report; currently exits non-zero due known advisories |
| `audit:ci` | `npm audit --audit-level=critical` | CI gate for critical vulnerabilities |

## Configuration Inventory

- `next.config.ts`: `reactStrictMode: true`.
- `tsconfig.json`: strict TypeScript, `moduleResolution: bundler`, path alias `@/*`.
- `vitest.config.ts`: React plugin, `jsdom`, `tests/setup.ts`, globals enabled, alias `@`.
- `eslint.config.mjs`: flat ESLint config using `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`.
- `postcss.config.mjs`: Tailwind PostCSS plugin.
- `.nvmrc` and `.node-version`: Node `24.14.0`.
- `.github/workflows/quality-gates.yml`: PR/main quality gate for clean install, lint, typecheck, tests, coverage, build, and critical audit.
- `.github/dependabot.yml`: conservative weekly grouped dependency updates; major updates ignored for manual review.
- `.gitignore`: ignores `node_modules`, `.next`, `out`, `dist`, `coverage`, `*.tsbuildinfo`, `.env`, `.env.*`, logs.
- `proxy.ts`: Next proxy/middleware-style auth gate for `/app` when Supabase env vars exist.

## Environment Variables

Source: `.env.example` and code search.

| Variable | Client visible | Used by | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | `lib/supabase/client.ts`, `proxy.ts` | Enables Supabase browser/server client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | `lib/supabase/client.ts`, `proxy.ts` | Supabase anon auth key |
| `AI_API_KEY` | No | `app/api/copilot/route.ts` | Optional provider key for OpenAI Responses API |
| `AI_MODEL` | No | `app/api/copilot/route.ts` | Optional model override; default is `gpt-5.5` |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Documented only | Server-only key, not referenced by app code |
| `SUPABASE_PROJECT_ID` | No | Documented only | Helper for generated Supabase types |

External services:

- Supabase Auth, Database, Storage, and RPC are optional. Without public Supabase env vars, the app runs local-first with Zustand/localStorage.
- OpenAI Responses API is optional. Without `AI_API_KEY`, Copilot returns deterministic mock actions.
- No service-role client is present in the current application code.

## Repository Map

Main folders inspected:

- `app`: Next App Router routes and API route.
- `components`: UI surfaces for landing, app home, dataset preview, dashboard, presentation, sharing, auth, layout, shared controls.
- `lib`: domain logic, parsing, profiling, semantic inference, query execution, dashboard spec generation, AI/Copilot, Supabase persistence, data-access adapter, store.
- `types`: public TypeScript contracts for datasets, dashboards, presentations, exports, AI, Supabase placeholder.
- `supabase`: SQL migrations and manual migration runner.
- `tests`: Vitest unit/integration/smoke tests and CSV fixtures.
- `docs`: currently contains Supabase setup plus this baseline documentation.

## Route Map

Build output verified these routes:

- Public/static: `/`, `/login`, `/logout`, `/datasets/preview`, `/dashboards/demo`, `/dashboards/demo/generate`, `/dashboards/demo/share`, `/present/demo`, `/presentations/demo`, `/share/demo`, `/share/datos-de-ejemplo`.
- App routes: `/app`, `/app/proyectos`, `/app/configuracion`, `/app/datasets/preview`, `/app/datasets/[datasetId]/preview`, `/app/generando`, `/app/dashboards/demo`, `/app/dashboards/[dashboardId]`, `/app/dashboards/demo/compartir`, `/app/dashboards/[dashboardId]/compartir`, `/app/present/demo`, `/app/present/[presentationId]`, `/app/presentaciones/crear`, `/app/presentaciones/[presentationId]/crear`.
- API: `/api/copilot`.
- Public share: `/share/[token]`.

## End-to-End Data Flow

1. Entry points:
   - `components/landing-page.tsx` and `components/app-home.tsx` accept CSV/XLS/XLSX uploads.
   - Demo/example data can be loaded from `lib/data/demo-dataset.ts`.

2. File import:
   - `lib/files/parse-file.ts` validates extension and a 25MB max size.
   - CSV parsing lives in `lib/files/parse-csv.ts`.
   - Excel parsing lives in `lib/files/parse-excel.ts`.
   - Column/table normalization lives in `lib/files/normalize-columns.ts`.
   - Parsed contracts are in `types/dataset.ts`.

3. Dataset profiling:
   - `lib/profiling/profile-dataset.ts` infers column types, semantic types, geo roles, null rates, unique counts, samples, min/max, warnings, and quality score.
   - `lib/semantic-layer/*` builds a richer semantic model used by dashboard generation and Copilot.

4. Persistence selection:
   - `lib/data-access/index.ts` is the local-first facade.
   - It checks `isSupabaseConfigured()` and `getCurrentAuthState()`.
   - If Supabase is missing or the user is not signed in, it writes to localStorage.
   - If Supabase operations fail, several flows fall back to localStorage with a warning.

5. Supabase persistence:
   - `lib/supabase/datasets.ts` creates projects, datasets, sheets, columns, rows, profile JSON, and optional original file upload to the private `dashboard-files` bucket.
   - Dataset rows are capped at `DATASET_ROW_LIMIT = 50_000` and inserted in batches of `500`.
   - `lib/supabase/dashboards.ts` writes legacy-compatible `dashboard_specs` and `dashboard_versions`.
   - `lib/supabase/dashboard-documents.ts` persists native v2 `DashboardDocument`, `DashboardRevision`, `DashboardPage` and `DashboardWidget` tables and reloads them before falling back to legacy JSON.
   - `lib/supabase/presentations.ts` writes `presentations` and `presentation_versions`.
   - `lib/supabase/share-links.ts` writes `share_links` and loads public shares through the RPC.

6. Dashboard generation:
   - `lib/dashboard-spec/generate-dashboard-spec.ts` builds a deterministic `DashboardSpec` from `DatasetProfile`, rows, and inferred semantic roles.
   - It only uses detected fields and confidence metadata; no external business data is introduced.
   - Dashboard editing helpers live in `lib/dashboard-spec/edit-dashboard-spec.ts` and `lib/dashboard-spec/apply-dashboard-action.ts`.

7. Query execution:
   - `lib/query-engine/execute-dashboard-query.ts` applies filters, date ranges, grouping, time granularity, series, sorting, limits, comparison queries, and calculated metrics.
   - `lib/query-engine/search.ts` supports table/data explorer search.

8. Dashboard UI:
   - `components/dashboard/dashboard-workspace.tsx` orchestrates dashboard, data explorer, edit panel, Copilot panel, save, share, and export menu.
   - `components/dashboard/dashboard-renderer.tsx` renders KPIs, charts, tables, filters, and Copilot panel.
   - `components/dashboard/data-explorer.tsx` renders table exploration and column metadata controls.
   - State is held in `lib/store/app-store.ts` with Zustand persistence.

9. Copilot:
   - Client calls flow through `lib/ai/copilot-client.ts` to `/api/copilot`.
   - `app/api/copilot/route.ts` validates top-level payload pieces with Zod schemas for dataset profile, dashboard spec, and presentation spec.
   - Without `AI_API_KEY`, it returns `createMockCopilotResponse`.
   - With `AI_API_KEY`, it calls `https://api.openai.com/v1/responses` and parses the structured response through `parseCopilotProviderOutput`.
   - Copilot action planning/execution/validation lives under `lib/ai/*` and `lib/validation/copilot-actions.ts`.
   - BI expert planning lives under `lib/copilot-bi`; direct analytical Q&A plans governed aggregate queries and the store executes them through QueryService before rendering a numeric answer with evidence in chat.
   - BI full-dashboard blueprints persist optional `DashboardSpec.pages` using the existing `DashboardPage` contract and the governed `dashboard.setPages` command-bus tool.
   - The command bus keeps BI mutations on the existing dry-run/diff/audit/undo path; no parallel Copilot execution path is introduced.

10. Presentation:
    - `lib/presentation-spec/generate-presentation-spec.ts` creates a `PresentationSpec` from the current dashboard widgets.
    - `components/presentation/presentation-builder.tsx` persists generated presentations.
    - `components/presentation/presentation-mode.tsx` renders presentation mode.

11. Sharing:
    - `components/share-export-page.tsx` creates share links through `persistShareLink`.
    - Local mode stores share links in localStorage.
    - Supabase mode inserts `share_links`.
    - `components/public-share-page.tsx` loads `/share/[token]`.
    - Supabase public share reads through `public.get_public_shared_dashboard(...)` hardened across migrations `0004` and `0005`.

12. Export:
    - Dashboard workspace supports browser-side CSV, DashboardSpec JSON, PDF and PNG downloads.
    - Presentation builder/share export supports PPTX downloads from `PresentationSpec` and slide PNG snapshots.
    - `lib/export/contracts.ts` defines Zod-validated export requests, targets, formats, scopes, statuses, results and errors.
    - `lib/export/renderers.ts` generates real PDF, PNG and PPTX bytes from specs, revision metadata, filters and queryable results instead of treating the current DOM as the only source of truth.
    - Public share export calls reject snapshots when `allowDownload=false` or the `export_snapshot` scope is absent.
    - `lib/export/create-manifest.ts` still creates a simple interactive export manifest and demo share link; interactive manifest import/open remains disabled.
    - `lib/export/storage-controls.ts` models direct-download export records and documents durable server-side storage/signed URLs as P2.

13. Security and observability:
    - `next.config.ts` applies CSP, frame isolation, nosniff, referrer policy, permissions policy and HSTS.
    - `lib/security/api.ts` provides bounded JSON parsing, structured API errors and correlation IDs.
    - `lib/security/rate-limit.ts` provides basic in-memory rate limiting for sensitive routes.
    - `lib/security/environment.ts` blocks local/demo persistence bypass in production without Supabase auth.
    - `lib/observability/audit.ts` and `lib/supabase/audit.ts` record redacted audit events in memory and DB.

## Auth and Access Control

- `proxy.ts` protects `/app/*` only when Supabase public env vars exist.
- `/share/*` and `/login` are public.
- If no Supabase env vars exist, app routes are not blocked in development/local mode, but production persistence bypass is rejected by `lib/security/environment.ts`.
- `components/login-page.tsx` uses Supabase email/password through `lib/supabase/auth.ts`.
- `dashpilot_local_mode` cookie can bypass protected route redirects while unauthenticated.
- RLS policies are defined in SQL migrations for ownership-based access and public share RPC access.

## Database and Storage

Migrations:

- `supabase/migrations/0001_dashpilot_core.sql`: core tables, first RLS policies, initial public share policy.
- `supabase/migrations/0002_real_dataset_pipeline.sql`: dataset sheets/rows/import jobs/audit logs, more RLS, storage bucket policies, public share RPC.
- `supabase/migrations/0003_dataset_versions_lifecycle.sql`: immutable dataset versions and activation RPC.
- `supabase/migrations/0004_public_share_security.sql`: hashed share tokens, scopes, snapshots, public access logs and hardened public RPC.
- `supabase/migrations/0005_public_share_filters.sql`: allowlisted public filter snapshots.
- `supabase/migrations/0006_resumable_import_jobs.sql`: resumable import job lifecycle.
- `supabase/migrations/0007_enterprise_foundation_hardening.sql`: dashboard documents/revisions/pages/widgets v2, export jobs, audit events and revision restore RPC.
- `supabase/migrations/run_all_manual.sql`: combined manual runner.

Critical tables represented in migrations and typed contracts:

- `profiles`
- `projects`
- `datasets`
- `dataset_sheets`
- `dataset_columns`
- `dataset_rows`
- `dashboard_specs`
- `dashboard_versions`
- `dashboard_documents`
- `dashboard_revisions`
- `dashboard_pages`
- `dashboard_widgets`
- `presentations`
- `presentation_versions`
- `chat_messages`
- `share_links`
- `share_widget_results`
- `share_filter_snapshots`
- `public_share_access_logs`
- `import_jobs`
- `audit_logs`
- `audit_events`
- `export_jobs`

Storage:

- Bucket: `dashboard-files`.
- Expected path: `{user_id}/{project_id}/{dataset_id}/{original_filename}`.
- Bucket policies limit object access by first path segment matching `auth.uid()`.

## Test Coverage Baseline

Current Vitest coverage areas:

- CSV/Excel parsing and column normalization.
- File-name cleanup.
- Locale value parsing.
- Dataset profiling and semantic layer.
- Column resolver and dataset understanding.
- Dashboard generation and editing.
- Query engine filters, table search, temporal aggregations, calculated metrics.
- Copilot context, service, action planning, agent loop, execution engine.
- Presentation spec generation.
- Data access local fallback.
- Share token validity.
- Rendering smoke tests.

Browser E2E coverage is configured through `npm run test:e2e` with Playwright.

## Current Baseline Conclusion

The repository builds, lints, typechecks, tests, and generates coverage successfully from a clean install on the observed machine using `npm.cmd`. The baseline is suitable for controlled functional work, with the important caveat that security advisories currently exist in transitive `postcss` and direct `xlsx`.
