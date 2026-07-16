# Checkpoint: capability-alignment-2026-07-16

Gate: blocked

Reviewed phase commit:

- `bce8f08 fix: align visible capabilities with real behavior`

Reviewer commit scope:

- Corrected a false "copied" success path when Clipboard API is unavailable.
- Corrected README capability wording from "virtualized preview" to "bounded dataset preview" for this phase.
- Added this checkpoint.

Working tree note:

- The repository was dirty before this review with unrelated changes in dashboard/data/storage/package/docs files. This checkpoint evaluates the phase commit and the targeted corrections only; unrelated worktree changes were not staged intentionally.

## Acceptance Criteria

| Criterion | Status | Evidence |
| --- | --- | --- |
| Inventory all CTAs and classify as real, partial, mock, disconnected or future | Partial | `lib/product/capabilities.ts` catalogs the product capabilities affected by this phase and `tests/capabilities.test.ts` snapshots them. It does not inventory every visible app CTA such as auth/navigation/settings controls. |
| Disable or hide temporarily unimplemented functions with honest explanation | Pass | `components/share-export-page.tsx` disables PDF, PNG, PPTX, manifest and link preview until a real link exists; password sharing is removed from toggles and explained as unavailable until server-side validation. |
| Replace artificial progress with real stages or indeterminate state | Pass | `components/generation-page.tsx` removed timer progress and uses generation/persistence stages. |
| Do not show success toast until verifiable result | Pass after correction | Share link now reports "copied" only after `navigator.clipboard.writeText` exists and resolves. Test added in `tests/cta-capabilities.test.tsx`. |
| Disconnect sharing password not validated server-side | Pass | `shareSettings.requirePassword` is no longer exposed as a toggle or passed to `persistShareLink`; UI explains server-side validation is missing. |
| Differentiate deterministic analysis, AI assistance and generated content | Pass | Generation, dataset preview and presentation builder labels now say deterministic/rules/local where applicable; Copilot displays execution mode. |
| Add feature flags for beta/future functions | Pass | `featureFlags` and `capabilities` gate PDF, PNG, PPTX, manifest, password share and provider Copilot status. |
| Update README/PRODUCT to reflect real state | Partial | `README.md` and `PRODUCT.md` now reflect this phase. Existing `docs/current-architecture.md` and `docs/known-gaps.md` still contain stale references to mock Copilot fallback/password UI from earlier phases. |
| E2E of all main CTAs | Fail (P1) | No Playwright/Cypress config or `test:e2e` script exists. The phase added Testing Library component tests, not browser E2E. |
| Snapshot of capability catalog | Pass | `tests/capabilities.test.ts` snapshots `capabilities`. |
| No productive button simulates PDF, PNG, PPTX, security or save | Pass | Static/manifest exports are disabled and password security is not presented as implemented. Save paths still call persistence adapters before success toasts. |
| Beta states clearly labeled | Pass | Share link and presentation persistence show beta/partial labeling; shell describes provider AI as beta partial. |
| Progress corresponds to verifiable events | Pass | Generation progress is tied to dataset availability, DashboardSpec generation and persistence result. |
| Documentation and interface do not contradict | Partial | README/PRODUCT align after correction; stale broader docs remain outside this phase commit. |

## Verification

Installation:

- Clean install not executed. The phase did not change dependencies. Also, `package.json` and `package-lock.json` had unrelated unstaged changes before this review, so running `npm ci` would not validate only the phase commit.

Commands executed:

- `git status --short --branch`: branch `main...origin/main [ahead 6]`; dirty worktree with unrelated pre-existing changes.
- `git show --stat --name-only --oneline HEAD`: confirmed phase files.
- `git diff --name-only HEAD^ HEAD`: confirmed affected files for commit `bce8f08`.
- `rg` audit for simulated export success, password UI, IA labels, mocks/fallbacks, permissive types, secrets and demo routes.
- `npm run test -- tests/capabilities.test.ts tests/cta-capabilities.test.tsx`: passed, 2 files and 4 tests.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test`: passed, 25 files and 172 tests.
- `npm run build`: passed, 23 app routes generated.
- `git diff --check`: passed; only line-ending warnings were reported.

## Defects Found

### P1 - Mandatory browser E2E for main CTAs was not implemented or executed

The prompt required E2E coverage for all main CTAs. The phase added component-level tests in `tests/cta-capabilities.test.tsx`, but no browser E2E runner/config/script exists. This blocks the gate by policy.

Required action before advancing:

- Add or enable a real browser E2E harness and cover the main CTA flow: share/export, disabled static exports, presentation creation/present gating, and primary generation route.
- Execute that E2E suite in addition to unit/component tests.

### P2 - CTA inventory is not exhaustive

`lib/product/capabilities.ts` inventories the capabilities touched by the phase, but not every visible CTA across landing, auth, settings, navigation, dashboard edit controls and project screens.

Required action before advancing:

- Either expand the capability catalog/snapshot to cover every visible productive CTA, or document why non-product CTAs are intentionally excluded from the inventory.

### P2 - Broader docs remain stale

`README.md` and `PRODUCT.md` were updated, but `docs/current-architecture.md` and `docs/known-gaps.md` still reference old mock/fallback/password states. These docs already had unrelated dirty changes, so they were not modified in this checkpoint.

Required action before advancing:

- Reconcile `docs/current-architecture.md` and `docs/known-gaps.md` after separating the pre-existing dirty changes.

### P2 - Phase validation is not fully reproducible from a clean checkout of the commit alone

Validation ran in the real workspace, but the workspace includes unrelated unstaged package/lint changes. This does not invalidate the runtime checks, but it weakens audit reproducibility for the exact phase commit.

Required action before advancing:

- Re-run validation from a clean worktree or isolate unrelated package/tooling changes in their own commit before final gate approval.

### Fixed During Review - Clipboard success fallback

Before this review, `navigator.clipboard?.writeText(result.url)` could resolve without copying when Clipboard API was unavailable, while still showing "copiado". The review correction now requires Clipboard API presence before claiming a copy.

### Fixed During Review - README capability wording

README claimed "virtualized preview" under capability status, but this phase commit did not include preview virtualization. The wording now says "bounded dataset preview".

## Security, Migrations, Rollback And Compatibility

- No migrations changed in the phase.
- No new environment variables were introduced.
- No service-role key or provider secret was exposed to client code in the phase.
- Password sharing remains disabled until server-side validation exists.
- Rollback is a normal revert of `bce8f08` plus this checkpoint/correction commit; no data migration rollback is required.
- Existing demo routes remain present as documented technical fallbacks. They are not newly introduced by this phase, but should remain visually distinguishable from authenticated production flows.

## Gate Decision

Not approved.

The gate must remain blocked while the P1 mandatory E2E gap is open. No P0 was found.
