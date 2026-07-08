alter table public.profiles add column if not exists email text;

alter table public.projects add column if not exists description text;
alter table public.projects add column if not exists status text default 'active';

alter table public.datasets add column if not exists user_id uuid references auth.users(id);
alter table public.datasets add column if not exists file_size bigint;
alter table public.datasets add column if not exists selected_sheet_name text;
alter table public.datasets add column if not exists status text default 'uploaded';
alter table public.datasets add column if not exists quality_score numeric;
alter table public.datasets add column if not exists updated_at timestamptz default now();

create table if not exists public.dataset_sheets (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid references public.datasets(id) on delete cascade,
  sheet_name text not null,
  row_count integer default 0,
  column_count integer default 0,
  is_selected boolean default false,
  created_at timestamptz default now()
);

alter table public.dataset_columns add column if not exists normalized_name text;
alter table public.dataset_columns add column if not exists position integer;
alter table public.dataset_columns add column if not exists null_count integer default 0;
alter table public.dataset_columns add column if not exists null_percentage numeric default 0;
alter table public.dataset_columns add column if not exists unique_count integer default 0;
alter table public.dataset_columns add column if not exists sample_values jsonb;
alter table public.dataset_columns add column if not exists min_value text;
alter table public.dataset_columns add column if not exists max_value text;
alter table public.dataset_columns add column if not exists statistics_json jsonb;

create table if not exists public.dataset_rows (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid references public.datasets(id) on delete cascade,
  row_index integer not null,
  row_json jsonb not null,
  created_at timestamptz default now()
);

create index if not exists dataset_rows_dataset_row_index_idx on public.dataset_rows(dataset_id, row_index);
create index if not exists dataset_rows_row_json_gin_idx on public.dataset_rows using gin(row_json);

alter table public.dashboard_specs add column if not exists user_id uuid references auth.users(id);
alter table public.dashboard_specs add column if not exists description text;
alter table public.dashboard_specs add column if not exists status text default 'active';

alter table public.presentations add column if not exists user_id uuid references auth.users(id);
alter table public.presentations add column if not exists status text default 'draft';

alter table public.chat_messages add column if not exists user_id uuid references auth.users(id);

alter table public.share_links add column if not exists user_id uuid references auth.users(id);
alter table public.share_links add column if not exists is_active boolean default true;
alter table public.share_links add column if not exists updated_at timestamptz default now();

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid references public.datasets(id) on delete cascade,
  user_id uuid references auth.users(id),
  status text default 'pending',
  progress integer default 0,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  project_id uuid references public.projects(id),
  entity_type text,
  entity_id uuid,
  action text not null,
  metadata jsonb,
  created_at timestamptz default now()
);

create index if not exists dataset_sheets_dataset_id_idx on public.dataset_sheets(dataset_id);
create index if not exists dataset_columns_dataset_id_idx on public.dataset_columns(dataset_id);
create index if not exists dashboard_versions_dashboard_id_idx on public.dashboard_versions(dashboard_id);
create index if not exists presentation_versions_presentation_id_idx on public.presentation_versions(presentation_id);
create index if not exists share_links_token_idx on public.share_links(token);
create index if not exists import_jobs_dataset_id_idx on public.import_jobs(dataset_id);

alter table public.dataset_sheets enable row level security;
alter table public.dataset_rows enable row level security;
alter table public.import_jobs enable row level security;
alter table public.audit_logs enable row level security;

create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users can manage project dataset sheets"
  on public.dataset_sheets for all
  using (
    exists (
      select 1
      from public.datasets d
      join public.projects p on p.id = d.project_id
      where d.id = dataset_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.datasets d
      join public.projects p on p.id = d.project_id
      where d.id = dataset_id and p.user_id = auth.uid()
    )
  );

create policy "Users can manage project dataset rows"
  on public.dataset_rows for all
  using (
    exists (
      select 1
      from public.datasets d
      join public.projects p on p.id = d.project_id
      where d.id = dataset_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.datasets d
      join public.projects p on p.id = d.project_id
      where d.id = dataset_id and p.user_id = auth.uid()
    )
  );

create policy "Users can manage dataset columns"
  on public.dataset_columns for all
  using (
    exists (
      select 1
      from public.datasets d
      join public.projects p on p.id = d.project_id
      where d.id = dataset_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.datasets d
      join public.projects p on p.id = d.project_id
      where d.id = dataset_id and p.user_id = auth.uid()
    )
  );

create policy "Users can manage dashboard versions"
  on public.dashboard_versions for all
  using (
    exists (
      select 1
      from public.dashboard_specs ds
      join public.projects p on p.id = ds.project_id
      where ds.id = dashboard_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.dashboard_specs ds
      join public.projects p on p.id = ds.project_id
      where ds.id = dashboard_id and p.user_id = auth.uid()
    )
  );

create policy "Users can manage presentations"
  on public.presentations for all
  using (
    exists (
      select 1
      from public.dashboard_specs ds
      join public.projects p on p.id = ds.project_id
      where ds.id = dashboard_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.dashboard_specs ds
      join public.projects p on p.id = ds.project_id
      where ds.id = dashboard_id and p.user_id = auth.uid()
    )
  );

create policy "Users can manage presentation versions"
  on public.presentation_versions for all
  using (
    exists (
      select 1
      from public.presentations pr
      join public.dashboard_specs ds on ds.id = pr.dashboard_id
      join public.projects p on p.id = ds.project_id
      where pr.id = presentation_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.presentations pr
      join public.dashboard_specs ds on ds.id = pr.dashboard_id
      join public.projects p on p.id = ds.project_id
      where pr.id = presentation_id and p.user_id = auth.uid()
    )
  );

create policy "Users can manage chat messages"
  on public.chat_messages for all
  using (
    exists (
      select 1
      from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  );

create policy "Users can manage own share links"
  on public.share_links for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage import jobs"
  on public.import_jobs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read own audit logs"
  on public.audit_logs for select
  using (auth.uid() = user_id);

drop policy if exists "Public share links can be read" on public.share_links;
drop policy if exists "Active public share links can be read" on public.share_links;

create or replace function public.get_public_shared_dashboard(share_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  link_row public.share_links%rowtype;
  dashboard_row public.dashboard_specs%rowtype;
  dataset_row public.datasets%rowtype;
  data_rows jsonb;
begin
  select *
    into link_row
    from public.share_links
   where token = share_token
     and access = 'public'
     and is_active = true
     and (expires_at is null or expires_at > now())
   limit 1;

  if not found then
    return null;
  end if;

  select *
    into dashboard_row
    from public.dashboard_specs
   where id = link_row.dashboard_id
     and status = 'active'
   limit 1;

  if not found then
    return null;
  end if;

  select *
    into dataset_row
    from public.datasets
   where id = dashboard_row.dataset_id
   limit 1;

  select coalesce(jsonb_agg(row_json order by row_index), '[]'::jsonb)
    into data_rows
    from public.dataset_rows
   where dataset_id = dashboard_row.dataset_id;

  return jsonb_build_object(
    'link', jsonb_build_object(
      'id', link_row.id,
      'dashboardId', link_row.dashboard_id,
      'token', link_row.token,
      'access', link_row.access,
      'expiresAt', link_row.expires_at,
      'allowFilters', link_row.allow_filters,
      'allowDownload', link_row.allow_download,
      'createdAt', link_row.created_at
    ),
    'dashboard', dashboard_row.spec_json,
    'viewState', dashboard_row.view_state_json,
    'profile', dataset_row.profile_json,
    'rows', data_rows
  );
end;
$$;

grant execute on function public.get_public_shared_dashboard(text) to anon, authenticated;

insert into storage.buckets (id, name, public)
values ('dashboard-files', 'dashboard-files', false)
on conflict (id) do nothing;

create policy "Users can upload dashboard files"
  on storage.objects for insert
  with check (
    bucket_id = 'dashboard-files'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can read own dashboard files"
  on storage.objects for select
  using (
    bucket_id = 'dashboard-files'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update own dashboard files"
  on storage.objects for update
  using (
    bucket_id = 'dashboard-files'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'dashboard-files'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete own dashboard files"
  on storage.objects for delete
  using (
    bucket_id = 'dashboard-files'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
