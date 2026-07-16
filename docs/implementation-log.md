# DashPilot Implementation Log

This file is cumulative. Add a new entry for every implementation or baseline task.

## Entry Template

```md
## YYYY-MM-DD - prompt-id

Commit:

Objective:

Files changed:

Architecture notes:

Validation:

Known failures:

Migrations/env vars:

Security/privacy notes:

Debt remaining:
```

## 2026-07-15 - baseline-2026-07-15

Commit: `chore: establish verified project baseline`

Objective:

- Create a reproducible baseline of the real DashPilot repository before functional changes.
- Inspect `app`, `components`, `lib`, `types`, `supabase`, `tests`, `docs`, and project configuration.
- Run clean install, typecheck, current lint script, tests, build, and audit.

Files changed:

- `docs/current-architecture.md`
- `docs/implementation-log.md`
- `docs/known-gaps.md`

Architecture notes:

- DashPilot is a Next App Router SaaS MVP with local-first persistence.
- Supabase Auth/Database/Storage/RPC are optional and enabled by public Supabase env vars plus an authenticated user.
- File import, profiling, semantic inference, dashboard generation, querying, Copilot, presentation, sharing, and export are implemented in local modules under `lib`.
- The `DashboardSpec` remains the central product contract.
- `lint` currently runs TypeScript only and duplicates `typecheck`.

Validation:

- `git status --short --branch`: clean before edits.
- `node -v`: `v24.14.0`.
- `npm.cmd -v`: `11.9.0`.
- `npm.cmd ci`: passed after sandbox escalation; installed 211 packages; npm reported 3 vulnerabilities.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed, but only executes `tsc --noEmit`.
- `npm.cmd run test`: passed, 21 files and 134 tests.
- `npm.cmd run build`: passed, Next 16.2.10/Turbopack, 23 app routes generated.
- `npm.cmd audit`: exited 1 with advisories for `postcss` through `next` and `xlsx`.

Known failures:

- `npm -v` through PowerShell failed because `npm.ps1` execution is disabled by system policy. Use `npm.cmd`.
- First sandboxed `npm.cmd ci` failed with `EPERM` reading the global npm cache in `AppData`; the same command passed outside the sandbox.
- `npm.cmd audit` reports 2 moderate and 1 high vulnerability.
- Git emits permission warnings for `C:\Users\Cristián\.config\git\ignore`.

Migrations/env vars:

- No migrations changed.
- No env vars changed.
- Inventory verified in `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `AI_API_KEY`, `AI_MODEL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_ID`.

Security/privacy notes:

- `SUPABASE_SERVICE_ROLE_KEY` is documented but not referenced in app code.
- Public share data is served through an RPC, not broad direct public table reads.
- Known gaps include placeholder Supabase types, incomplete audit usage, and export/share hardening needs.

Debt remaining:

- See `docs/known-gaps.md`.
