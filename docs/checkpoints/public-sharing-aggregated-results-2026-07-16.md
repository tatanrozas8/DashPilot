# Checkpoint: public-sharing-aggregated-results-2026-07-16

Commit reviewed: `13ea6ce security: redesign public sharing around aggregated results`

Reviewer result: **gate not approved**.

Reason: one P1 acceptance gap remains open: `allowFilters=true` does not provide usable public filters or filtered aggregate results. The server validates `requested_filters`, but the public client never sends them and only renders a static list of allowed filters.

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
| Public payload returns aggregate allowlisted results by widget/revision. | Mostly passed | `share_widget_results` stores `widget_id`, `revision_id`, and `result_json`. RPC only returns rows whose widget id exists in current dashboard spec. Remaining risk: static snapshots are not recomputed for allowed filters. |
| Filters remain allowed without arbitrary queries. | **Failed P1** | `components/public-share-page.tsx` calls `loadPublicShare(token)` and `loadPublicShare(token, password)` only. It renders a "Filtros permitidos" list but no input controls and no `requested_filters` call. RPC validates `requested_filters`, but no public UI path uses it. |
| Avoid resource enumeration. | Passed | Public errors are generic in UI; RPC returns `null` for unavailable, expired, revoked, invalid password, invalid scope and invalid filter cases. |
| Rate limiting and brute-force protection exist. | Passed | RPC counts denied/rate-limited attempts per token hash prefix and hashed IP over 10 minutes and logs `rate_limited`. Unit test covers threshold helper. |
| Access-crossing/widget manipulation is prevented. | Passed | RPC looks up links by token hash, binds results to `share_link_id`, and only returns `share_widget_results` whose widget id exists in the linked dashboard spec. Static migration test covers widget allowlist string. |
| Failed snapshot persistence does not leave an active partial public link. | Fixed in checkpoint | Reviewer found this defect and corrected `createShareLink` to revoke the just-created link when `share_widget_results` insertion fails. Added `tests/share-links-persistence.test.ts`. |

## Test Evidence

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test`: passed, 30 files and 189 tests.
- `npm run build`: passed, 23 app routes generated.
- `npx.cmd vitest run tests/share-links-persistence.test.ts tests/share.test.ts tests/public-share-security.test.ts`: passed, 3 files and 6 tests.
- `npx.cmd playwright test --reporter=line --timeout=30000`: passed, 1 Chromium E2E test.

Environment notes:

- `npm.ps1` / `npx.ps1` remain blocked by local PowerShell execution policy; `.cmd` variants were used where needed.
- Git still warns that `C:\Users\Cristián\.config\git\ignore` cannot be read.
- E2E emits the existing Next warning about `scroll-behavior: smooth`; not introduced by this phase.

## Defects Found

### P1 - Public filters are not usable despite `use_filters` scope

Evidence:

- `components/public-share-page.tsx` calls `loadPublicShare(token)` on initial load and `loadPublicShare(token, password)` on password retry.
- No public client code constructs or submits `requested_filters`.
- The UI renders a static list under "Filtros permitidos" instead of controls that update aggregate results.
- RPC validates `requested_filters`, but returns the persisted snapshot from `share_widget_results`; no filtered snapshot recomputation or precomputed filtered snapshot retrieval exists.

Impact:

- The mandatory requirement "Mantén filtros permitidos sin permitir consultas arbitrarias" is not satisfied.
- A share created with "Permitir usar filtros e interacciones" suggests a capability that is not available in the public route.

Required action before advancing:

- Either implement a server-side filtered aggregate path for allowlisted filters and wire the public UI to it, or disable/rename the public filter capability so the product no longer claims filters are usable.
- Add E2E covering public filter usage or disabled filter behavior, depending on the chosen product decision.

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

## Gate Decision

Gate status: **not approved**.

Blocking condition:

- P1 public filters acceptance gap remains open.

Mandatory actions before advancing:

1. Resolve the P1 filter capability mismatch.
2. Add/update tests for the selected resolution.
3. Re-run lint, typecheck, full tests, build and E2E.
4. Update this checkpoint or create a new checkpoint showing the P1 is closed.
