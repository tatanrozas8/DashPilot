# DashPilot

DashPilot is a SaaS MVP that turns real Excel or CSV files into executive dashboards, live presentations, and shareable interactive links.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Useful checks:

```bash
npm run typecheck
npm run test
npm run build
```

## Real Upload Flow

The main flow is:

```txt
Landing -> Upload Excel/CSV -> Dataset preview -> Generate dashboard -> Dashboard -> Presentation -> Share
```

Supported files:

- `.csv`
- `.xlsx`
- `.xls`

The browser parser validates the file, detects workbook sheets, normalizes column names, removes empty rows, profiles the selected sheet, and generates a `DashboardSpec` from the detected fields. Example data is still available through `Probar con datos de ejemplo`.

Current MVP limits:

- Up to 50,000 rows are processed in-browser.
- Dataset preview renders the first 100 rows.
- Supabase persistence is active when env vars and Auth session are available.
- The app remains functional without Supabase env vars by using Zustand/localStorage.
- AI Copilot actions are mocked and operate on the current `DashboardSpec`.
- Max upload size is 25MB for the browser MVP.

## Environment

Supabase is optional for local development.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_PROJECT_ID=
```

Do not expose `SUPABASE_SERVICE_ROLE_KEY` in client code.

Full setup guide: `docs/supabase-setup.md`.

If `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is missing, DashPilot shows:

```txt
Supabase no esta configurado. DashPilot esta funcionando en modo local.
```

## Auth

`/login` provides a simple Supabase Auth email/password flow:

- `Iniciar sesion` uses `supabase.auth.signInWithPassword`.
- `Crear cuenta` uses `supabase.auth.signUp`.
- `/logout` signs out and returns to `/`.

Internal routes are protected by `middleware.ts` when Supabase is configured. If no session exists, `/app/*` redirects to `/login`. Demo/local mode remains usable when Supabase is not configured.

## Supabase

Migrations live in `supabase/migrations/`.

Included tables cover:

- `profiles`
- `projects`
- `datasets`
- `dataset_sheets`
- `dataset_columns`
- `dataset_rows`
- `dashboard_specs`
- `dashboard_versions`
- `presentations`
- `presentation_versions`
- `chat_messages`
- `share_links`
- `import_jobs`
- `audit_logs`

Storage bucket:

```txt
dashboard-files
```

Suggested storage path:

```txt
user_id/project_id/dataset_id/original_filename
```

RLS policies are included for the main ownership model. Public share rendering goes through the controlled RPC, not broad table reads.

Apply migrations with your preferred Supabase workflow, for example:

```bash
supabase db push
```

Create/verify the private Storage bucket:

```txt
dashboard-files
```

The app uploads originals to:

```txt
{user_id}/{project_id}/{dataset_id}/{original_filename}
```

Public sharing uses the SQL RPC:

```txt
get_public_shared_dashboard(share_token text)
```

It returns only the dashboard spec, view state, profile, rows needed for rendering, and share settings for an active, non-expired public token.

Generate real Supabase types after creating a project:

```bash
npx supabase gen types typescript --project-id TU_PROJECT_ID --schema public > types/supabase.ts
```

## Architecture

The core rule is:

```txt
Dataset + DatasetProfile + DashboardSpec + ViewState + PresentationSpec = live dashboard or presentation
```

Important folders:

- `types/`: strict contracts for datasets, dashboards, presentations, exports, AI messages, share links, and import jobs.
- `lib/files/`: file validation, Excel/CSV parsing, sheet extraction, row normalization, and column normalization.
- `lib/profiling/`: deterministic dataset profiler with type inference, semantic inference, warnings, and quality score.
- `lib/query-engine/`: filters, grouping, aggregation, sorting, limiting, and temporal granularity.
- `lib/dashboard-spec/`: dashboard generation from real `DatasetProfile` and rows.
- `lib/presentation-spec/`: live presentation generation from dashboard widgets.
- `lib/supabase/`: Supabase Auth, datasets, dashboards, share links, presentations, chat, and compatibility persistence helpers.
- `lib/data-access/`: local-first adapter that chooses Supabase when configured/authenticated and localStorage otherwise.
- `lib/validation/`: Zod schemas for persisted structured payloads.
- `components/dashboard/`: renderer, filters, widgets, empty states, and Copilot panel.
- `lib/store/app-store.ts`: Zustand state and local persistence.

## Routes

- `/`: public landing with upload and example-data buttons.
- `/login`: Supabase Auth login/signup.
- `/logout`: sign out.
- `/app`: internal SaaS home.
- `/app/proyectos`: projects screen.
- `/app/datasets/preview`: active dataset preview.
- `/app/datasets/[datasetId]/preview`: dynamic preview alias.
- `/app/generando`: dashboard generation progress.
- `/app/dashboards/demo`: technical current-dashboard fallback.
- `/app/dashboards/[dashboardId]`: dynamic dashboard alias.
- `/app/presentaciones/crear`: presentation builder.
- `/app/presentaciones/[presentationId]/crear`: dynamic presentation builder alias.
- `/app/present/demo`: technical current-presentation fallback.
- `/app/present/[presentationId]`: dynamic presentation alias.
- `/app/dashboards/demo/compartir`: share/export fallback.
- `/app/dashboards/[dashboardId]/compartir`: dynamic share/export alias.
- `/share/demo`: technical public share fallback.
- `/share/[token]`: public share token alias.

## Testing

Current tests cover:

- CSV parsing.
- Excel parsing.
- Column normalization.
- Dataset profiling.
- Dashboard generation.
- Query filters and temporal aggregations.
- Presentation generation.
- Rendering smoke tests.
- Share token generation.
- Dataset row batching.
- Local-first data access fallback.
- Share expiration validation.
- Real CSV fixture pipeline QA.

Fixture:

```txt
tests/fixtures/ventas_demo.csv
tests/fixtures/ventas_real_test.csv
```

## Current Production Gaps

- Supabase types are represented by a permissive placeholder until generated from a real project.
- Static PDF/PNG/PPTX export buttons are UI actions, not full export pipelines yet.
- Public share by token is implemented through RPC, but download/export enforcement should be hardened server-side before production.
