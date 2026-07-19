# DashPilot Security Overview

Date: 2026-07-19

## Threat Model

Primary assets:

- User datasets, parsed rows and dataset profiles.
- DashboardDocument, DashboardRevision, DashboardPage and DashboardWidget records.
- Public share tokens, password hashes, scoped snapshot results and access logs.
- Export requests/results and downloadable files.
- Copilot prompts, action plans and command-bus audit evidence.

Primary threats:

- Cross-user access to datasets, dashboards, revisions, shares or exports.
- Public share escalation from snapshot viewing to raw-row access.
- Public share download bypass when `allowDownload=false`.
- Production fallback to local/demo mode without auth.
- Oversized or malformed API payloads.
- Rate-limit abuse against Copilot, query and public-share flows.
- Secret leakage in logs, audit metadata or errors.

## Current Controls

- `supabase/migrations/0007_enterprise_foundation_hardening.sql` adds native v2 tables for dashboard documents, revisions, pages and widgets, plus `export_jobs` and `audit_events`.
- RLS is enabled for v2 dashboard, export and audit tables. Policies are owner-based through `auth.uid()`.
- `public.get_public_shared_dashboard` serves aggregated public snapshots and enforces scopes. Public downloads require `export_snapshot`; `allowDownload=false` maps to absence of that scope.
- `/api/copilot` and `/api/query` use bounded JSON parsing, structured `DomainError` responses and correlation IDs.
- `/api/query` requires an authenticated Supabase user and relies on RLS for dataset reads.
- `next.config.ts` applies CSP, `frame-ancestors 'none'`, `nosniff`, referrer policy, permissions policy and HSTS.
- `lib/security/environment.ts` blocks local/demo persistence bypass in production when Supabase is missing or the user is unauthenticated.
- `lib/security/rate-limit.ts` provides in-memory rate limiting for sensitive routes. It is intentionally not distributed.
- `lib/observability/audit.ts` redacts secrets, tokens, passwords, authorization values, rows and prompts from audit metadata.

## Critical Routes

- `/api/copilot`: Copilot provider and deterministic fallback.
- `/api/query`: authenticated governed query execution.
- `/share/[token]`: public share renderer backed by scoped snapshots.
- Dashboard save/update flows through `lib/data-access/index.ts` and `lib/supabase/dashboards.ts`.
- Export creation/download flows through `lib/export/*` and dashboard workspace export actions.

## Secret Handling

- Do not commit `.env`, `.env.local`, `.env.*.local`, Supabase keys, service role keys or `AI_API_KEY`.
- Server/client logs must use redacted metadata helpers for sensitive operations.
- Service role keys must never be exposed to client modules.

## Known Security Limits

- Rate limiting is in-memory and suitable only for a single runtime instance.
- Export storage is still direct-download. `export_jobs` and adapter contracts exist, but durable server-side storage/signed URLs are P2.
- DB/RLS/RPC coverage is a SQL/static harness in Vitest unless Supabase local is run separately.
- Dependency advisories remain for `xlsx` and transitive `postcss`; see `docs/dependency-management.md`.
