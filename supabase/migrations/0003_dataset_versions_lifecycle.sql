create table if not exists public.dataset_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  user_id uuid references auth.users(id),
  version_number integer not null,
  status text not null default 'created' check (status in ('created', 'uploading', 'processing', 'validating', 'ready', 'failed', 'cancelled', 'superseded')),
  checksum text not null,
  schema_hash text not null,
  idempotency_key text,
  file_name text not null,
  file_type text not null,
  file_size bigint not null default 0,
  selected_sheet_name text not null,
  row_count integer not null default 0,
  column_count integer not null default 0,
  profile_json jsonb not null default '{}'::jsonb,
  quality_score numeric,
  storage_path text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ready_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  superseded_at timestamptz,
  constraint dataset_versions_number_unique unique (dataset_id, version_number),
  constraint dataset_versions_ready_timestamp check (status not in ('ready', 'superseded') or ready_at is not null),
  constraint dataset_versions_failed_timestamp check (status <> 'failed' or failed_at is not null),
  constraint dataset_versions_cancelled_timestamp check (status <> 'cancelled' or cancelled_at is not null)
);

create unique index if not exists dataset_versions_idempotency_unique
  on public.dataset_versions(dataset_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists dataset_versions_project_idx on public.dataset_versions(project_id, created_at desc);
create index if not exists dataset_versions_dataset_status_idx on public.dataset_versions(dataset_id, status);
create index if not exists dataset_versions_checksum_idx on public.dataset_versions(project_id, checksum);

alter table public.dataset_versions enable row level security;

alter table public.datasets add column if not exists active_version_id uuid references public.dataset_versions(id) on delete set null;
alter table public.datasets add column if not exists active_version_number integer not null default 0;

alter table public.dataset_sheets add column if not exists dataset_version_id uuid references public.dataset_versions(id) on delete cascade;
alter table public.dataset_columns add column if not exists dataset_version_id uuid references public.dataset_versions(id) on delete cascade;
alter table public.dataset_rows add column if not exists dataset_version_id uuid references public.dataset_versions(id) on delete cascade;
alter table public.dashboard_specs add column if not exists dataset_version_id uuid references public.dataset_versions(id) on delete restrict;
alter table public.import_jobs add column if not exists dataset_version_id uuid references public.dataset_versions(id) on delete cascade;
alter table public.import_jobs add column if not exists idempotency_key text;

insert into public.dataset_versions (
  project_id,
  dataset_id,
  user_id,
  version_number,
  status,
  checksum,
  schema_hash,
  file_name,
  file_type,
  file_size,
  selected_sheet_name,
  row_count,
  column_count,
  profile_json,
  quality_score,
  storage_path,
  created_at,
  updated_at,
  ready_at
)
select
  d.project_id,
  d.id,
  d.user_id,
  1,
  'ready',
  'legacy-' || d.id::text,
  'legacy-schema-' || d.id::text,
  d.file_name,
  d.file_type,
  coalesce(d.file_size, 0),
  coalesce(d.selected_sheet_name, 'legacy'),
  d.row_count,
  d.column_count,
  d.profile_json,
  d.quality_score,
  d.storage_path,
  d.created_at,
  coalesce(d.updated_at, d.created_at),
  coalesce(d.updated_at, d.created_at)
from public.datasets d
where not exists (
  select 1
  from public.dataset_versions existing
  where existing.dataset_id = d.id
);

update public.datasets d
   set active_version_id = v.id,
       active_version_number = greatest(d.active_version_number, v.version_number)
  from public.dataset_versions v
 where v.dataset_id = d.id
   and v.version_number = 1
   and d.active_version_id is null;

update public.dataset_sheets s
   set dataset_version_id = d.active_version_id
  from public.datasets d
 where s.dataset_id = d.id
   and s.dataset_version_id is null;

update public.dataset_columns c
   set dataset_version_id = d.active_version_id
  from public.datasets d
 where c.dataset_id = d.id
   and c.dataset_version_id is null;

update public.dataset_rows r
   set dataset_version_id = d.active_version_id
  from public.datasets d
 where r.dataset_id = d.id
   and r.dataset_version_id is null;

update public.dashboard_specs ds
   set dataset_version_id = d.active_version_id,
       spec_json = case
         when d.active_version_id is null then ds.spec_json
         else jsonb_set(ds.spec_json, '{datasetVersionId}', to_jsonb(d.active_version_id::text), true)
       end
  from public.datasets d
 where ds.dataset_id = d.id
   and ds.dataset_version_id is null;

update public.import_jobs j
   set dataset_version_id = d.active_version_id
  from public.datasets d
 where j.dataset_id = d.id
   and j.dataset_version_id is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'dataset_rows_version_required'
  ) then
    alter table public.dataset_rows
      add constraint dataset_rows_version_required check (dataset_version_id is not null);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'dataset_columns_version_required'
  ) then
    alter table public.dataset_columns
      add constraint dataset_columns_version_required check (dataset_version_id is not null);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'dataset_sheets_version_required'
  ) then
    alter table public.dataset_sheets
      add constraint dataset_sheets_version_required check (dataset_version_id is not null);
  end if;
end;
$$;

create or replace function public.prevent_dataset_version_content_update()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('ready', 'failed', 'cancelled', 'superseded') then
    if old.checksum is distinct from new.checksum
      or old.schema_hash is distinct from new.schema_hash
      or old.file_name is distinct from new.file_name
      or old.file_type is distinct from new.file_type
      or old.file_size is distinct from new.file_size
      or old.selected_sheet_name is distinct from new.selected_sheet_name
      or old.row_count is distinct from new.row_count
      or old.column_count is distinct from new.column_count
      or old.profile_json is distinct from new.profile_json
      or old.quality_score is distinct from new.quality_score
      or old.storage_path is distinct from new.storage_path then
      raise exception 'dataset version content is immutable after terminal state';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists dataset_version_content_immutable on public.dataset_versions;
create trigger dataset_version_content_immutable
before update on public.dataset_versions
for each row execute function public.prevent_dataset_version_content_update();

drop policy if exists "Users can manage dataset versions" on public.dataset_versions;

create policy "Users can manage dataset versions"
  on public.dataset_versions for all
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

create or replace function public.activate_dataset_version(
  target_dataset_id uuid,
  target_version_id uuid,
  expected_active_version_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  version_row public.dataset_versions%rowtype;
  previous_version_id uuid;
begin
  select *
    into version_row
    from public.dataset_versions
   where id = target_version_id
     and dataset_id = target_dataset_id
     and status in ('ready', 'superseded')
   for update;

  if not found then
    raise exception 'dataset version must be ready before activation';
  end if;

  select active_version_id
    into previous_version_id
    from public.datasets
   where id = target_dataset_id
   for update;

  update public.datasets
     set active_version_id = target_version_id,
         active_version_number = active_version_number + 1,
         row_count = version_row.row_count,
         column_count = version_row.column_count,
         profile_json = version_row.profile_json,
         quality_score = version_row.quality_score,
         storage_path = coalesce(version_row.storage_path, storage_path),
         status = 'ready',
         updated_at = now()
   where id = target_dataset_id
     and active_version_id is not distinct from expected_active_version_id;

  if not found then
    raise exception 'dataset version activation conflict';
  end if;

  if previous_version_id is not null and previous_version_id <> target_version_id then
    update public.dataset_versions
       set status = 'superseded',
           superseded_at = now(),
           updated_at = now()
     where id = previous_version_id
       and status = 'ready';
  end if;

  update public.dataset_versions
     set status = 'ready',
         ready_at = coalesce(ready_at, now()),
         superseded_at = case when id = target_version_id then null else superseded_at end,
         updated_at = now()
   where id = target_version_id;

  return jsonb_build_object(
    'datasetId', target_dataset_id,
    'activeVersionId', target_version_id,
    'previousVersionId', previous_version_id
  );
end;
$$;

grant execute on function public.activate_dataset_version(uuid, uuid, uuid) to authenticated;

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
  version_row public.dataset_versions%rowtype;
  resolved_version_id uuid;
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

  resolved_version_id := coalesce(dashboard_row.dataset_version_id, dataset_row.active_version_id);

  if resolved_version_id is not null then
    select *
      into version_row
      from public.dataset_versions
     where id = resolved_version_id
     limit 1;
  end if;

  select coalesce(jsonb_agg(row_json order by row_index), '[]'::jsonb)
    into data_rows
    from public.dataset_rows
   where dataset_version_id = resolved_version_id;

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
    'dashboard', jsonb_set(dashboard_row.spec_json, '{datasetVersionId}', to_jsonb(resolved_version_id::text), true),
    'viewState', dashboard_row.view_state_json,
    'profile', coalesce(version_row.profile_json, dataset_row.profile_json),
    'rows', data_rows
  );
end;
$$;

grant execute on function public.get_public_shared_dashboard(text) to anon, authenticated;
