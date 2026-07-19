# DashPilot Operations Runbook

Date: 2026-07-19

## Quality Gates

Run from the repository root:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run build
npm.cmd run test:e2e
npm.cmd audit
```

If Playwright fails with Chromium `spawn EPERM` in the managed sandbox, rerun elevated and record both the first failure and the elevated result.

## Supabase Migrations

Apply migrations in order. Do not edit already-applied migrations; create additive migrations.

Current enterprise foundation migration:

```text
supabase/migrations/0007_enterprise_foundation_hardening.sql
```

It adds:

- `dashboard_documents`
- `dashboard_revisions`
- `dashboard_pages`
- `dashboard_widgets`
- `export_jobs`
- `audit_events`
- `restore_dashboard_revision(...)`

## Regenerate Supabase Types

When Supabase CLI and project access are available:

```powershell
npx.cmd supabase gen types typescript --project-id $env:SUPABASE_PROJECT_ID --schema public > types\supabase.ts
```

Review the generated diff before commit. Keep critical table, RPC and enum shapes explicit.

## DB/RLS/RPC Tests

Default repository coverage uses a Vitest harness:

```powershell
npx.cmd vitest run tests\enterprise-foundation-hardening.test.ts tests\public-share-migration.test.ts tests\share.test.ts tests\export-deliverables.test.ts
```

For real DB validation, run against a disposable Supabase project or local Supabase instance:

- Apply all migrations.
- Create two authenticated users.
- Verify user A cannot read/update user B dashboard documents, revisions, pages, widgets, export jobs or audit events.
- Verify public share RPC returns snapshots only and never raw `dataset_rows`.
- Verify revoked/expired/invalid/password-failed shares return null and write denied/rate-limited logs.
- Verify `restore_dashboard_revision` creates a new revision and does not mutate the old revision.

Do not report "RLS tested" unless the real DB run was executed.

## Audit Review

Audit data lives in:

- `audit_events` for enterprise foundation events.
- `public_share_access_logs` for public share access.
- Legacy `audit_logs` remains for older records.

Review by `correlation_id`, `entity_type`, `entity_id` and `created_at`. Audit metadata must not include raw rows, prompts, tokens, passwords or secrets.

## Export/Share Incident

If a public link exposes unexpected data:

1. Revoke the `share_links` row by setting `is_active=false` and `revoked_at=now()`.
2. Review `public_share_access_logs` by token hash prefix.
3. Review `audit_events` for related `share.create`, `export.create` or `export.download.blocked` events.
4. Rotate any exposed share URLs.
5. Preserve logs without copying raw rows into tickets.

## Secret Rotation

Rotate Supabase anon/service credentials and `AI_API_KEY` from provider consoles. Update deployment environment variables only; never store keys in Git.
