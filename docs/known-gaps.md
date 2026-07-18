# DashPilot Known Gaps

Date: 2026-07-15
Prompt ID: baseline-2026-07-15

Classification:

- Verified: directly observed in repository files or command output.
- Hypothesis: plausible risk that needs runtime, product, or external-service validation.

## Verified Gaps

| Severity | Area | Gap | Evidence | Probable file(s) |
| --- | --- | --- | --- | --- |
| High | Dependency security | `xlsx` has high-severity advisories for prototype pollution and ReDoS; npm reports no fix available. | `npm.cmd audit` exits 1. | `package.json`, `package-lock.json`, `lib/files/parse-excel.ts` |
| Medium | Dependency security | `next` currently depends on vulnerable `postcss <8.5.10`; npm suggests `audit fix --force` but that would install a breaking Next version path according to npm output. | `npm.cmd audit` reports 2 moderate vulnerabilities. | `package.json`, `package-lock.json` |
| High | Type safety | Supabase generated types remain broad placeholders instead of generated table contracts. This weakens table contracts at the persistence boundary. | `types/supabase.ts`. | `types/supabase.ts` |
| Medium | API boundary | Copilot API validates major payload objects with Zod, but still casts `semanticModel`, `viewState`, `messages`, `copilotContext`, and `rows` after broad object checks. | `parseContext` casts raw input. | `app/api/copilot/route.ts` |
| Medium | Error visibility | Copilot provider failures silently degrade to mock responses, including non-OK provider responses and catch-all exceptions. This protects UX but can hide provider outages. | `if (!response.ok) return createMock...`; empty `catch`. | `app/api/copilot/route.ts` |
| Medium | Persistence visibility | Several Supabase failures fall back to localStorage with warning strings. This preserves the flow but can make production persistence failures look like successful local work. | `catch` blocks in data-access facade. | `lib/data-access/index.ts` |
| Medium | Public sharing | The public share RPC returns all `dataset_rows` for the dashboard dataset and does not enforce row-level export limits in SQL. | `jsonb_agg(row_json order by row_index)` in RPC. | `supabase/migrations/0002_real_dataset_pipeline.sql` |
| Medium | Password sharing | UI exposes `Requerir contrasena`, and table schema has `password_hash`, but `ShareLink` and `persistShareLink` do not persist or validate a password. | Share UI setting is not included in persistence input/type. | `components/share-export-page.tsx`, `types/export.ts`, `lib/data-access/index.ts`, `lib/supabase/share-links.ts` |
| Medium | Auditability | `audit_logs` table exists, but app code does not write audit log entries for destructive or sensitive actions. | Search found `audit_logs` only in migrations/types/docs. | `supabase/migrations/*`, persistence modules |
| Medium | Destructive operations | Delete helpers for datasets and dashboards directly delete records/localStorage keys. Confirmation/reversibility/audit is not enforced at the domain function level. | `deleteDataset`, `deleteDashboard`. | `lib/supabase/datasets.ts`, `lib/supabase/dashboards.ts` |
| Medium | Import observability | `import_jobs` table exists but the current client import flow does not create/update import job records. | Search found `import_jobs` only in migrations/types/docs. | `supabase/migrations/*`, `lib/data-access/index.ts`, `lib/supabase/datasets.ts` |
| Medium | RLS verification | RLS policies exist in SQL, but there is no database isolation test suite in the repo. | Tests are Vitest only; no Supabase CLI/SQL tests configured. | `supabase/migrations/*`, `tests/*`, `package.json` |
| Medium | Export fidelity | PDF/PNG/PPTX exports now generate real files, but charts are rendered as deterministic static summaries/raster snapshots rather than native editable chart objects inside PPTX. | `lib/export/renderers.ts`, export tests. | `lib/export/*`, `components/share-export-page.tsx`, `components/presentation/presentation-builder.tsx` |
| Low | Build reproducibility | PowerShell `npm` command is blocked by system execution policy on this machine; docs/checks should use `npm.cmd`. | `npm -v` failed with `PSSecurityException`. | Local environment |
| Low | Git environment | Git emits permission warnings reading the global ignore file. | `git status` output. | Local environment |
| Medium | Test quality | Coverage can be generated but no minimum coverage threshold is enforced yet. | `npm.cmd run test:coverage` passes and reports coverage without thresholds. | `vitest.config.ts`, `package.json` |
| Low | Architecture artifacts | No existing `graphify-out/graph.json` was present for graph-based architecture querying. | `Test-Path graphify-out\graph.json` returned `False`. | Local repository |

## Hypotheses To Validate

| Severity | Area | Hypothesis | Validation needed |
| --- | --- | --- | --- |
| High | Production import security | Client-side XLSX parsing may remain exposed to malicious workbook edge cases while `xlsx` has no fixed version. | Evaluate a maintained parser alternative, sandbox parsing, or server-side scanning before production upload hardening. |
| Medium | Share privacy | `allowDownload` and `allowFilters` are enforced in local public export code and share scopes, but production should still add database/RPC export policy tests before broad rollout. | Add RPC tests and explicit server-side policy checks for public share settings. |
| Medium | Accessibility | Basic accessible controls exist, but there is no automated accessibility check or manual screen-reader baseline in the repo. | Add axe/Playwright or documented manual a11y pass for critical flows. |
| Medium | Responsive UX | Browser E2E covers core flows, but there is no dedicated mobile/responsive viewport matrix for upload, dashboard, share, and presentation flows. | Add browser E2E coverage for desktop and mobile widths. |
| Medium | Operational monitoring | Local-first fallbacks are useful for MVP, but production may need telemetry/alerts when Supabase or AI provider failures occur. | Define observability requirements and log/report failure modes without exposing sensitive data. |
| Low | Version drift | Root dependency ranges are now exact, but transitive updates still require conservative Dependabot review and lockfile diffs. | Review Dependabot PRs and update policy after the first dependency cycle. |

## Current Check Failures and Warnings

| Severity | Command | Summary | Probable owner/file |
| --- | --- | --- | --- |
| Low | `npm -v` | Failed through PowerShell because `npm.ps1` execution is disabled. `npm.cmd -v` works. | Local Windows shell |
| Low | `npm.cmd ci` | First sandboxed attempt failed with `EPERM` reading global npm cache. Passed outside sandbox. | Local npm cache permissions |
| High | `npm.cmd audit` | Reports `xlsx` high-severity advisories with no fix available. | `package.json`, Excel import pipeline |
| Medium | `npm.cmd audit` | Reports `postcss` moderate advisory through `next`. | `package.json`, Next dependency |
| Low | `git status` | Warns that global Git ignore cannot be read. | Local Git config permissions |

## Passing Baseline Checks

- `npm.cmd ci`
- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run test:coverage`
- `npm.cmd run build`
- `npm.cmd run test:e2e`
- `npm.cmd run audit:ci`

These passing checks do not mean the product is production-hardened; they establish the current reproducible baseline.
