# Copilot BI Polish Goal Checkpoint

Date: 2026-07-19
Prompt ID: copilot-bi-polish-goal-2026-07-19

## Scope

Close the most important P2 debt from G6 without adding unrelated features or changing exports, connectors, RBAC, enterprise hardening, or the browser-storage privacy policy.

## Coverage Review

| Area | Status | Evidence |
| --- | --- | --- |
| Analytical Q&A direct answer | Implemented | `lib/copilot-bi/analytical-answer.ts` plans direct governed aggregate queries and formats the answer, highlighted value, metric, period, filters, evidenceId and context. |
| QueryService execution | Implemented | `lib/store/app-store.ts` executes direct Q&A through `executeAggregateQuery`; no dashboard mutation or pending plan is created for simple analytical questions. |
| Ambiguity handling | Implemented | Direct analytical Q&A uses the existing BI clarification engine before executing; tests cover profitability when margin/cost inputs are absent. |
| No invented data or causality | Implemented | Answers are descriptive only and are derived from QueryService results/metadata. |
| DashboardPage persistence | Implemented | BI blueprints now emit a governed `dashboard.setPages` command that stores `DashboardPage[]` on `DashboardSpec.pages` after widgets are created. |
| Command bus/audit/undo | Implemented | `dashboard.setPages` is typed, schema-validated, diffed as `dashboard.pages`, audited, and restored by command-bus undo. |
| Single-page compatibility | Implemented | `DashboardSpec.pages` is optional; dashboards without pages continue rendering the existing flat grid. |
| Page rendering | Implemented | `components/dashboard/dashboard-renderer.tsx` renders DashboardPage sections only when page metadata exists. |
| Duplicate React keys | Implemented | Copilot metric/dimension chips, filter options, blueprint preview rows, diff entries and global filters use collision-resistant composed keys. |
| Unit/integration coverage | Implemented | Tests cover scalar Q&A, evidenceId, ambiguity, multipage blueprint persistence, command-bus page tool, undo, page rendering and duplicate keys. |
| E2E scenario coverage | Implemented | `tests/e2e/copilot-agent.spec.ts` is split into direct Q&A, multipage dashboard, correction, ambiguity and undo scenarios. |

## Gate Findings

### P0

None known.

### P1

None known.

### P2

- Browser reload does not persist full dashboard specs in local/demo mode by design. The existing browser-storage policy prohibits full specs, rows, profiles, prompts and provider replies in persistent browser storage. The G6.1 implementation persists pages in the active `DashboardSpec`/command-bus revision flow and keeps this privacy boundary intact.
- Durable database persistence for native v2 `DashboardDocument`/`DashboardRevision` remains part of the broader v2 persistence transition, not this Copilot-only polish goal.

## Validation

- `npm.cmd run typecheck`: passed.
- `npx.cmd vitest run tests/copilot-bi-expert.test.ts`: passed, 1 file and 8 tests.
- `npx.cmd vitest run tests/copilot-ux.test.tsx tests/render.test.tsx`: passed, 2 files and 10 tests.
- `npx.cmd vitest run tests/copilot-bi-expert.test.ts tests/copilot-ux.test.tsx`: passed, 2 files and 13 tests after the selected-widget routing fix.
- `npm.cmd run lint`: passed.
- `npm.cmd run test`: passed, 49 files and 287 tests. Existing jsdom navigation warning observed.
- `npm.cmd run build`: passed, production build generated 24/24 static pages.
- `npm.cmd run test:e2e`: first non-elevated run failed with Chromium `browserType.launch: spawn EPERM`; the stuck teardown was stopped and rerun elevated.
- `npm.cmd run test:e2e` elevated: passed, 10 Chromium tests. Intermediate elevated runs caught and fixed strict E2E locators plus selected-widget routing; one unrelated navigation flake passed on immediate full rerun.
- Process check after validation found no Next/npm/Playwright/Chromium test processes alive.

## Security And Artifacts

- No `.env`, `.env.local`, `.env.*.local`, Supabase key, service role key, `AI_API_KEY`, `node_modules`, `.next`, `test-results`, `playwright-report`, coverage folder, generated screenshot, PDF, PNG or PPTX is intentionally included.
- No raw rows are sent to the provider context; direct Q&A executes against the local/Supabase QueryService path.

## Gate Decision

Approved. No known P0 or P1 blockers remain. Do not push automatically; create commits only after final Git diff and artifact checks.
