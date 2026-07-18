# Export deliverables goal checkpoint - 2026-07-18

## Gate decision

Status: approved.

DashPilot now generates real static export files for dashboards and presentations. PDF, PNG and PPTX controls create non-empty valid files from specs, revision metadata, filters and queryable results. Success toasts are shown only after a Blob-backed download is created.

## Requirement review

| Area | Status | Evidence |
| --- | --- | --- |
| PDF real | Approved | `generateDashboardExport(..., "pdf")` and presentation PDF path write valid `%PDF-1.4` bytes with title, source, timestamp, revision, filters and widget summaries. |
| PNG real | Approved | `generateDashboardExport(..., "png")` writes 1200x800 PNG bytes; `generatePresentationExport(..., "png")` writes 1280x720 slide PNG bytes with metadata chunks. |
| PPTX real | Approved | `generatePresentationExport(..., "pptx")` writes an Open XML ZIP package with `[Content_Types].xml`, `ppt/presentation.xml`, ordered slides and slide relationships. |
| Export jobs | Approved | `lib/export/contracts.ts` models `idle`, `queued`, `rendering`, `generating`, `ready`, `failed` and `expired`; UI surfaces queued/rendering/generating/ready/failed states. |
| Typed contract | Approved | Zod schemas cover request, target, format, scope, status, result and error; invalid slide/PPTX and public download-disabled requests are rejected. |
| Revision/filtros | Approved | Dashboard revision IDs derive from dashboard, dataset version and `updatedAt`; result metadata carries dashboard/presentation revisions and filters. |
| Not DOM-only | Approved | Export bytes are generated from `DashboardSpec`, `PresentationSpec`, `DashboardViewState`, queryable rows or public widget snapshots, not from the current DOM as source of truth. |
| Files reales | Approved | Unit tests inspect PDF header/content, PNG signature/dimensions/metadata and PPTX ZIP structure. E2E verifies browser downloads. |
| Seguridad | Approved | Public share export rejects missing `allowDownload` or `export_snapshot`; UI disables public download controls when download is forbidden. |
| UI | Approved | Dashboard, Share/Export and Presentation Builder expose export buttons, status labels, ready/failure states and retryable error messages. |
| E2E | Approved | Playwright covers dashboard PDF/PNG, presentation PPTX, public share PNG/PDF, legacy JSON/CSV downloads and no critical visible errors. |
| Artefactos/secrets | Approved | No `.env`, keys, `node_modules`, `.next`, `test-results`, `playwright-report`, `coverage` or generated accidental artifact is intended for commit. |

## Validation

- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run test`: passed, 48 files / 272 tests.
- `npm.cmd run build`: passed; 24/24 static pages generated.
- `npm.cmd run test:e2e`: passed after sandbox escalation, 6 Chromium tests.
- Targeted unit/integration: `npm.cmd run test -- tests/export-deliverables.test.ts tests/cta-capabilities.test.tsx tests/share.test.ts tests/public-share-page.test.tsx`: passed, 4 files / 18 tests.
- Targeted E2E: `npm.cmd run test:e2e -- tests/e2e/capability-ctas.spec.ts tests/e2e/product-workflow.spec.ts`: passed after sandbox escalation, 5 Chromium tests.

## E2E evidence

- Main share/export CTAs show only interactive manifest as disabled.
- Dashboard PDF downloads with `.pdf` filename.
- Dashboard PNG downloads with `.png` filename.
- Presentation PPTX downloads with `.pptx` filename.
- Public share page downloads allowed PNG/PDF snapshots.
- Product workflow imports `tests/fixtures/ventas_real_test.csv`, generates dashboard, uses Copilot/presentation, then downloads PDF/PNG/PPTX/JSON from the dynamic share/export route.
- No critical visible runtime error text is present.

## Limitations

- PPTX charts are represented as editable text/evidence summaries and raster-ready placeholders, not native editable PowerPoint chart objects.
- PDF/PNG rendering is deterministic and spec/data-backed, but it is not a pixel-perfect DOM/headless-browser capture.
- Export files are browser-generated and immediately downloaded; no durable server-side export storage or expiration cleanup exists because no storage pipeline was added.

## P0/P1/P2

P0: none.

P1: none.

P2:

- Add native editable PowerPoint charts if sales decks require post-export chart editing.
- Add pixel-perfect DOM/headless render mode if brand/legal requires exact visual parity with the on-screen dashboard.
- Add database/RPC export policy tests for public shares before production hardening.
- Keep dependency advisories tracked: direct `xlsx` high advisory with no fix and transitive `postcss` moderate advisory via Next.
- Git still warns that `C:\Users\CristiÃ¡n\.config\git\ignore` cannot be read.
- Playwright/Next logs environment warnings where `NO_COLOR` is ignored because `FORCE_COLOR` is set.

## Notes

- No push was performed for this goal.
- No dependencies changed, so `npm ci` was not required.
- Playwright needs elevated execution in this sandbox to launch Chromium; non-elevated runs fail with `spawn EPERM`.
