# DashPilot Data Governance

Date: 2026-07-19

## Data Classes

- Source rows: sensitive. Stored in Supabase dataset tables or in-memory local session only.
- Dataset profiles: derived metadata. May include samples and should be treated as sensitive.
- Dashboard specs and revisions: business metadata. Persisted in DB v2 for authenticated users.
- Public share payloads: aggregated snapshots only. Raw rows are not included.
- Export files: sensitive. Current implementation downloads directly; durable storage is P2.
- Audit events: operational metadata only. No raw rows, prompts, passwords, tokens or secrets.

## Persistence Rules

- Production requires Supabase configuration and authenticated user for persistence.
- Browser persisted Zustand state is limited to IDs, preferences and non-sensitive UI state.
- `DashboardDocument`, `DashboardRevision`, `DashboardPage` and `DashboardWidget` persist through v2 DB tables when Supabase is active.
- Rollback is logical: restore creates a new revision from an existing revision.

## Public Share Rules

- Public viewers receive scoped snapshot results.
- Filters are allowlisted and bounded.
- Downloads require `export_snapshot`; `allowDownload=false` removes that scope.
- Invalid, expired, revoked or rate-limited share requests return no payload.

## Accepted P2 Debt

- Distributed rate limiting requires external storage.
- Durable export storage/signed URLs require a server-side renderer/storage adapter.
- Real DB/RLS/RPC tests require a Supabase runtime in CI or a disposable project.
