# Checkpoint: public-sharing-aggregated-results-2026-07-16

Commit reviewed: `13ea6ce security: redesign public sharing around aggregated results`

Reviewer result: **gate approved after P1 correction**.

Original checkpoint result: gate was not approved because `allowFilters=true` did not provide usable public filters or filtered aggregate results. The P1 was corrected in `public-sharing-filters-p1-2026-07-16`.

## Scope Reviewed

- `docs/implementation-log.md`
- Commit `13ea6ce`
- Public sharing implementation files:
  - `components/public-share-page.tsx`
  - `components/public-dashboard-snapshot.tsx`
  - `components/share-export-page.tsx`
  - `lib/supabase/share-links.ts`
  - `lib/share/public-access.ts`
  - `lib/share/public-snapshot.ts`
  - `lib/data-access/index.ts`
  - `lib/data-access/outbox.ts`
  - `lib/data-access/types.ts`
  - `lib/validation/schemas.ts`
  - `types/export.ts`
  - `types/supabase.ts`
  - `supabase/migrations/0004_public_share_security.sql`
  - related unit/component/E2E tests.

Clean install: not executed; no dependency or lockfile change belongs to this phase/checkpoint.

## Acceptance Criteria

| Criterion | Status | Evidence |
| --- | --- | --- |
| DevTools does not reveal source rows in a normal public link. | Passed | Public page no longer hydrates private store with `rows`; it loads `PublicSharedDashboard` and renders `widgetResults` only in `components/public-share-page.tsx`. RPC migration test asserts no `dataset_rows`, no `'rows', data_rows`, and no `'profile'` in `get_public_shared_dashboard`. |
| `allowDownload=false` is enforced server-side. | Passed | Scopes derive from `publicShareScopes`; `allowDownload` is returned from RPC only when `'export_snapshot' = any(link_row.scopes)`. Unit tests assert scopes omit `export_snapshot` when downloads are disabled. |
| Revocation and expiration are immediate. | Passed | RPC denies `is_active=false`, `revoked_at is not null`, and expired links before returning payload. Client `disableShareLink` sets both `is_active=false` and `revoked_at`. Unit tests cover expired/revoked local validity. |
| Every access is audited with reasonable privacy. | Passed | Migration creates `public_share_access_logs` and logs granted, denied, rate-limited, invalid password, invalid scope and invalid filter outcomes using token hash prefix plus hashed request metadata. No raw token/IP/user-agent is stored. |
| Token is not recoverable from storage. | Passed | Migration backfills `token_hash` with SHA-256 and nulls `token`; new links insert `token: null` and `token_hash`. |
| Expiration, revocation, password and scope are validated only server-side for public access. | Passed | RPC validates availability, password hash, scopes and filter payload before returning the public payload. UI no longer treats these flags as authoritative security. |
| Public payload returns aggregate allowlisted results by widget/revision. | Passed | `share_widget_results` stores `widget_id`, `revision_id`, and `result_json`. `share_filter_snapshots` maps exact filter requests to precomputed aggregate revisions. RPC returns only the selected revision. |
| Filters remain allowed without arbitrary queries. | Passed after correction | Public UI now builds real `requested_filters` with the existing `DashboardFilter` contract. RPC validates shape, field, operator, value length and allowed value membership before selecting an exact precomputed snapshot. |
| Avoid resource enumeration. | Passed | Public errors are generic in UI; RPC returns `null` for unavailable, expired, revoked, invalid password, invalid scope and invalid filter cases. |
| Rate limiting and brute-force protection exist. | Passed | RPC counts denied/rate-limited attempts per token hash prefix and hashed IP over 10 minutes and logs `rate_limited`. Unit test covers threshold helper. |
| Access-crossing/widget manipulation is prevented. | Passed | RPC looks up links by token hash, binds results to `share_link_id`, and only returns `share_widget_results` whose widget id exists in the linked dashboard spec. Static migration test covers widget allowlist string. |
| Failed snapshot persistence does not leave an active partial public link. | Fixed in checkpoint | Reviewer found this defect and corrected `createShareLink` to revoke the just-created link when `share_widget_results` insertion fails. Added `tests/share-links-persistence.test.ts`. |

## Test Evidence

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test`: passed, 31 files and 195 tests.
- `npm run build`: passed, 23 app routes generated.
- `npx.cmd vitest run tests/share-links-persistence.test.ts tests/share.test.ts tests/public-share-security.test.ts`: passed, 3 files and 6 tests.
- `npx.cmd playwright test --reporter=line --timeout=30000`: passed, 1 Chromium E2E test.
- `npx.cmd vitest run tests/public-share-page.test.tsx tests/public-share-security.test.ts tests/public-share-migration.test.ts tests/share-links-persistence.test.ts tests/share.test.ts tests/data-access.test.ts`: passed, 6 files and 20 tests.
- `npx.cmd playwright test --reporter=line --timeout=45000`: passed, 2 Chromium E2E tests.

Environment notes:

- `npm.ps1` / `npx.ps1` remain blocked by local PowerShell execution policy; `.cmd` variants were used where needed.
- Git still warns that `C:\Users\Cristián\.config\git\ignore` cannot be read.
- E2E emits the existing Next warning about `scroll-behavior: smooth`; not introduced by this phase.
- `npm.cmd run test:e2e` was stabilized in commit `1bc235d` and now runs `playwright test --reporter=line --timeout=45000`; the official script passes 2 Chromium E2E tests and exits deterministically.

## Defects Found

### P1 - Public filters are not usable despite `use_filters` scope

Status: **closed**.

Evidence:

- `components/public-share-page.tsx` calls `loadPublicShare(token)` on initial load and `loadPublicShare(token, password)` on password retry.
- No public client code constructs or submits `requested_filters`.
- The UI renders a static list under "Filtros permitidos" instead of controls that update aggregate results.
- RPC validates `requested_filters`, but returns the persisted snapshot from `share_widget_results`; no filtered snapshot recomputation or precomputed filtered snapshot retrieval exists.

Impact:

- The mandatory requirement "Mantén filtros permitidos sin permitir consultas arbitrarias" is not satisfied.
- A share created with "Permitir usar filtros e interacciones" suggests a capability that is not available in the public route.

Required action before advancing:

- Implemented server-side exact-match precomputed filtered aggregate snapshots.
- Added public UI controls and E2E coverage for applying and clearing a public filter.

### P2 - Migration rollback is not executable

Evidence:

- `supabase/migrations/0004_public_share_security.sql` is forward-only. It nulls recoverable `share_links.token` values after hashing.

Impact:

- Rollback to the old public sharing model is intentionally not possible without backups because raw tokens are discarded.

Required action:

- Document operational rollback as "restore from backup / keep old code behind release gate until migration completes" before production rollout.

### P2 - Supabase generated types remain permissive for legacy tables

Evidence:

- `types/supabase.ts` still uses `type AnyRecord = { [key: string]: unknown }` for tables outside the public-share scope.

Impact:

- The public-share tables are specifically typed, but broader Supabase type safety remains weak and could hide unrelated regressions.

Required action:

- Replace placeholder table types with generated Supabase types in a separate type-hardening phase.

### P2 - Password hashing is fast SHA-256 with salt

Evidence:

- `lib/share/public-access.ts` and the RPC use SHA-256 over password plus salt.

Impact:

- Acceptable for token hashing, weaker for user-chosen password protection if hashes are exposed through a database breach.

Required action:

- Use a slow password hash strategy supported by the deployment model before treating public-link passwords as production-grade tenant security.

## Correction Applied In This Checkpoint

Defect:

- `createShareLink` inserted `share_links` first and then inserted `share_widget_results`. If snapshot insertion failed, an active public link could remain with an incomplete/empty snapshot.

Correction:

- `lib/supabase/share-links.ts` now revokes the just-created link with `is_active=false` and `revoked_at=now` when snapshot persistence fails.
- Added `tests/share-links-persistence.test.ts` to assert rollback behavior.

Severity after correction:

- Closed P2.

## P1 Correction Applied After Checkpoint

Symptom:

- `allowFilters=true` displayed only static filter names.
- The public route never sent `requested_filters`.

Root cause:

- Public shares had only a base aggregate snapshot and no persisted mapping from safe filter requests to aggregate result revisions.

Correction:

- Added bounded `allowedValues` to public filter metadata.
- Added `share_filter_snapshots` and `allowed_filters_json` through `supabase/migrations/0005_public_share_filters.sql`.
- Public share creation now persists base and allowed filtered aggregate snapshots without exposing source rows.
- The public RPC validates exact `requested_filters` server-side and returns only the precomputed revision for that request.
- The public page now renders usable controls, loading/error states, active filter chips, apply and clear actions.

Security guardrails:

- Public users cannot choose arbitrary fields, operators, values, query specs, metrics or raw columns.
- The current public UI supports one active allowlisted filter at a time, matching the bounded snapshot strategy.
- Invalid filters return no payload and keep the last valid dashboard state in the client.

Tests added/updated:

- `tests/public-share-page.test.tsx`
- `tests/public-share-security.test.ts`
- `tests/public-share-migration.test.ts`
- `tests/e2e/capability-ctas.spec.ts`

## Gate Decision

Gate status: **approved**.

Blocking condition:

- None open for this phase.

Mandatory actions before advancing:

1. Keep the bounded one-filter public snapshot contract unless a future product decision expands filter combinations.
2. Add executable Supabase/Postgres tests for the 0005 RPC before production rollout.
