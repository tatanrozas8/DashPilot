# Product workflow goal checkpoint - 2026-07-18

## Gate decision

Status: approved.

DashPilot now has a clearer professional workflow across entry, project/import, preview, dashboard editing, Copilot, presentation and share/export. The primary validated browser journey uses real dynamic app routes after import/generation and does not rely on `/demo` dashboard routes for the main path.

## Requirement review

| Area | Status | Evidence |
| --- | --- | --- |
| App shell | Approved | `components/layout/AppShell.tsx` adds breadcrumbs, dynamic dataset/dashboard/share links, command search, sync status, session/local sandbox badges and notification surface. |
| Design system base | Approved | `components/shared/ui.tsx` adds reusable `StatusBadge`, `Panel`, `Input`, `Select`, `Tabs`, `Dialog`, `Drawer`, `Tooltip`, `EmptyState`, `ErrorState`, `Skeleton`, `Table`, `LoadingState` and `IconButton`. |
| Inicio/proyectos/importacion | Approved | `components/app-home.tsx` adds real loading/error state and a six-step import workflow map; project cards continue linking to implemented routes. |
| Preview/calidad/columnas | Approved | Existing preview remains virtualized and shows sheets, bounded rows, quality warnings, column correction, parse audit and empty/error/loading states. |
| Dashboard | Approved | Dashboard workspace keeps view/data mode, save state, source footer, filters, widgets with loading/error/empty and Copilot integration. |
| Editor | Approved | `components/dashboard/dashboard-editor.tsx` now exposes required tabs: Datos, Visual, Formato and Interaccion, with dataset-backed metric/dimension controls and validation copy. |
| Copiloto agente | Approved | Existing command-bus Copilot remains integrated; E2E covers plan, diff, apply, undo and clarification. |
| Presentaciones | Approved | `PresentationSpec` now includes source dashboard revision metadata and snapshot mode; builder renders "Revision vinculada". |
| Export/share | Approved | JSON/CSV downloads remain real; interactive share remains beta/partial; PDF/PNG/PPTX/manifest remain disabled with honest labels. |
| CTAs | Approved | Removed dead public landing nav/learn-more CTAs; visible export/presentation/share CTAs are real, gated or disabled. |
| Accessibility baseline | Approved | Added/kept labels, focus-ring usage, disabled states, tab roles, icon-button labels and keyboard command search. |
| E2E | Approved | Added `tests/e2e/product-workflow.spec.ts` for import fixture to preview, dashboard generation, editor, Copilot, presentation, share/export and reload persistence. |
| Generated artifacts/secrets | Approved | `next-env.d.ts` restored after build/E2E; no generated artifacts or secrets staged intentionally. |

## Validation

- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run test`: passed, 47 files / 265 tests.
- `npm.cmd run build`: passed; 24/24 static pages generated.
- `npm.cmd run test:e2e`: passed, 6 Chromium tests.
- Targeted UI/unit preflight: `npm.cmd run test -- tests/product-workflow-ui.test.tsx tests/presentation.test.ts tests/cta-capabilities.test.tsx tests/render.test.tsx`: passed, 4 files / 11 tests.
- Targeted product E2E: `npm.cmd run test:e2e -- tests/e2e/product-workflow.spec.ts`: passed, 1 Chromium test.

## E2E evidence

The new product E2E verifies:

- Local sandbox mode is explicit before `/app`.
- A real CSV fixture is imported from `tests/fixtures/ventas_real_test.csv`.
- Dataset preview, data table and profiling are visible.
- Dashboard generation lands on a dynamic `/app/dashboards/dashboard_*` route.
- Editor tabs Datos, Visual, Formato and Interaccion are visible and usable.
- Copilot produces a plan and diff without applying immediately.
- Presentation builder shows linked dashboard revision and snapshot mode.
- Presentation mode opens from a saved presentation.
- Share/export page keeps future exports disabled and downloads real DashboardSpec JSON.
- Reload preserves the share/export route state enough to continue the workflow.
- No critical visible runtime error text is present.

## P0/P1/P2

P0: none.

P1: none.

P2:

- Static PDF/PNG/PPTX export remains disabled until real render pipelines exist.
- Supabase generated types remain permissive placeholders until generated from a real project.
- Database-level RLS/public-share tests remain a production hardening item.
- Dependency advisories remain tracked: direct `xlsx` high advisory with no fix and transitive `postcss` moderate advisory via Next.
- Git still warns that `C:\Users\Cristián\.config\git\ignore` cannot be read.
- Playwright/Next logs environment warnings where `NO_COLOR` is ignored because `FORCE_COLOR` is set.

## Notes

- No push was performed for this goal.
- No dependencies changed, so `npm ci` was not required.
- The repo still contains technical demo/fallback routes, but the validated main product journey generates and uses dynamic app routes after import/generation.
