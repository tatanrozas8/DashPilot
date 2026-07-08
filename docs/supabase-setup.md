# Supabase Setup for DashPilot

Use this checklist to connect DashPilot to a real Supabase project.

## 1. Create Project

1. Create a Supabase project.
2. Copy the project URL.
3. Copy the public anon key.
4. Create `.env.local` from `.env.example`.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
SUPABASE_PROJECT_ID=YOUR_PROJECT_ID
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only. Never import it from client components or browser code.

## 2. Run Migrations

Apply the migrations in `supabase/migrations/`.

```bash
supabase db push
```

The migrations create the core app tables, RLS policies, `get_public_shared_dashboard(share_token text)`, the private `dashboard-files` bucket registration, and Storage policies scoped to the authenticated user's top-level folder.

## 3. Verify Storage Bucket

In Supabase Storage:

1. Ensure bucket `dashboard-files` exists.
2. Keep it private.
3. Confirm policies allow authenticated users to upload/read/update/delete only paths where the first folder is their `auth.uid()`.

DashPilot uploads original files to:

```txt
{user_id}/{project_id}/{dataset_id}/{original_filename}
```

If the bucket is missing, the app shows:

```txt
El bucket dashboard-files no existe. Crealo en Supabase Storage.
```

## 4. Generate TypeScript Types

When the project id is available, generate real Supabase types:

```bash
npx supabase gen types typescript --project-id TU_PROJECT_ID --schema public > types/supabase.ts
```

The repository includes a permissive placeholder `types/supabase.ts` so local builds pass before a real project exists. Replace it with generated types before production hardening.

## 5. Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Expected states:

- Missing env vars: DashPilot shows `Modo local`.
- Env vars present, no session: internal routes redirect to `/login`.
- Session present: datasets, dashboards, share links, presentations and chat persist to Supabase.

## 6. QA Flow

1. Go to `/login`.
2. Create or sign in with email/password.
3. Upload `tests/fixtures/ventas_real_test.csv` from the landing or `/app`.
4. Confirm dataset preview opens at `/app/datasets/[datasetId]/preview`.
5. Click `Generar dashboard automaticamente`.
6. Confirm dashboard opens at `/app/dashboards/[dashboardId]`.
7. Open share/export.
8. Copy an interactive link.
9. Open `/share/[token]` in another browser session.
10. Confirm invalid/expired tokens show an elegant error.

## 7. Verification Commands

```bash
npm run typecheck
npm run test
npm run build
```

`npm run lint` is currently an alias of `tsc --noEmit`.

## Security Notes

- Internal route protection is implemented with Next middleware and Supabase SSR cookies when env vars exist.
- `/share/[token]` remains public and loads through the RPC only.
- Direct public select policies on `share_links` are dropped in the hardening migration.
- Original files stay in a private bucket.
- `allow_download` is returned to the public renderer, but full export/download enforcement should remain server-side when export endpoints are added.
