# Enterprise Foundation Hardening Checkpoint

Date: 2026-07-19
Goal: G7 Enterprise foundation, persistencia v2, seguridad y hardening operacional
Gate: Approved

## Scope Implemented

- Native v2 DB contract for `DashboardDocument`, `DashboardRevision`, `DashboardPage` and `DashboardWidget`.
- Durable multipage persistence through `dashboard_pages` and `dashboard_widgets`.
- Authenticated dashboard reload reads v2 tables first and falls back to legacy JSON only for older installs.
- Supabase critical types replaced with explicit table/RPC contracts.
- API boundary hardening for Copilot and Query routes with bounded body parsing, structured errors and correlation IDs.
- `/api/query` now requires authenticated Supabase user instead of a fixed placeholder actor.
- Security headers configured in Next.
- Production local/demo persistence bypass blocked.
- In-memory rate limiting added for sensitive API scopes.
- Audit event contracts added, with redaction and DB-backed `audit_events`.
- Export storage control contract added; durable server-side storage documented as P2.
- Operational docs added.

## Validation

- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed.
- `npm.cmd run test`: passed, 50 files / 294 tests.
- `npm.cmd run build`: passed, 24/24 static pages.
- `npx.cmd vitest run tests\enterprise-foundation-hardening.test.ts`: passed, 1 file / 7 tests.
- `npm.cmd run test:e2e`: first non-elevated attempt failed with Chromium `spawn EPERM`; elevated rerun passed, 10/10 Chromium tests.
- `npm.cmd audit`: completed and reported known advisories: `xlsx` high with no fix, `postcss` moderate through Next with only a breaking forced path.

## DB/RLS/RPC Evidence

- Static SQL harness verifies v2 dashboard/export/audit tables, RLS enablement, ownership policies and `restore_dashboard_revision`.
- Existing public-share migration/tests verify hashed tokens, scoped snapshots, public access logs, rate limiting and `export_snapshot` scope enforcement.
- Real Supabase DB/RLS/RPC execution was not run in this environment yet; this remains P2 because the migration and harness are present, but no local Supabase runtime was available in the current task.

## Security Evidence

- `allowDownload=false` is enforced server-side by absence of `export_snapshot` in public share scopes.
- API errors include correlation IDs and avoid stack traces/secrets.
- Audit metadata redacts token/password/API key/authorization/row/prompt fields.
- Production local fallback throws unless Supabase is configured and the user is authenticated.
- Headers include CSP, frame isolation, nosniff, referrer policy, permissions policy and HSTS.

## P0 / P1

- P0: none.
- P1: none.

## P2

- Real DB/RLS/RPC tests should be executed against Supabase local or a disposable project.
- Rate limiting is in-memory and not distributed.
- Durable export storage/signed URLs remain adapter-ready but not implemented server-side.
- Dependency advisories remain for `xlsx` high and transitive `postcss` moderate.
- Public share owner-facing audit UI is not implemented.

## Secrets And Artifacts

- No `.env`, `.env.local`, `.env.*.local`, Supabase keys, service role key or `AI_API_KEY` are included.
- No `node_modules`, `.next`, `test-results`, `playwright-report`, `coverage`, screenshots, PDFs, PNGs, PPTX files, dumps or local artifacts should be committed.

## Decision

Approved with P2 debt only. The goal closes the enterprise foundation blockers without adding visible product features.
