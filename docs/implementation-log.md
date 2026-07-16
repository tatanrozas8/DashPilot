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


## 2026-07-16 - query-engine-semantic-calc-2026-07-16

Commit: fix: make dashboard calculations semantically correct

Objective:

- Eliminate silently incorrect dashboard calculations in the query engine.
- Preserve real zero while preventing null, empty, invalid, NaN, infinity and non-numeric values from becoming fake zeroes.

Files changed:

- types/dashboard.ts
- lib/query-engine/execute-dashboard-query.ts
- lib/dashboard-spec/generate-dashboard-spec.ts
- lib/presentation-spec/generate-presentation-spec.ts
- components/dashboard/dashboard-renderer.tsx
- components/dashboard/data-explorer.tsx
- tests/query-engine.test.ts
- tests/real-pipeline.test.ts
- tests/presentation.test.ts
- tests/fixtures/query_semantics_golden.csv
- docs/implementation-log.md

Architecture notes:

- Query results keep backward-compatible value fields and add non-enumerable metadata: result, state, coverage, validCount, excludedCount and structured warnings.
- Numeric aggregation policy is explicit in the query engine: sum/avg/min/max use only valid numeric values; count includes all filtered rows; count_distinct excludes null, undefined and empty strings.
- Division by zero in calculated metrics returns an indeterminate null result with a structured warning.
- Dashboard and presentation generation now carry query warnings instead of converting unavailable metrics to zero.

Validation:

- npm run typecheck: passed.
- npm run test -- tests/query-engine.test.ts tests/real-pipeline.test.ts tests/presentation.test.ts tests/dashboard-spec.test.ts tests/dataset-understanding.test.ts: passed, 5 files and 53 tests.
- npm run lint: passed.
- npm run test: passed, 21 files and 152 tests.
- npm run build: passed, 23 app routes generated.

Known failures:

- git status continues to emit permission warnings for the user-level git ignore file.
- DuckDB/SQL reference execution was not added because the project has no DuckDB dependency; tests include a SQL-style independent average reference over the same numeric policy.

Migrations/env vars:

- No database migrations changed.
- No environment variables changed.
- No dependency changes.

Security/privacy notes:

- No client exposure of service-role keys or sensitive rows was introduced.
- Query warnings are aggregate-quality metadata only; they do not include raw row payloads.

Debt remaining:

- Add a real DuckDB/SQL comparison if DashPilot adopts a local analytical engine dependency.
- Consider persisted query-result schema versioning if query outputs are later stored server-side.
