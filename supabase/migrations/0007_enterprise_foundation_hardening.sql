alter table public.dashboard_specs add column if not exists active_revision_id text;
alter table public.dashboard_specs add column if not exists semantic_model_id text;

create table if not exists public.dashboard_documents (
  id uuid primary key references public.dashboard_specs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  dataset_id uuid not null references public.datasets(id) on delete restrict,
  dataset_version_id uuid references public.dataset_versions(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  subtitle text,
  current_revision_id text,
  published_revision_id text,
  global_filters_json jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'archived', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dashboard_revisions (
  id text primary key,
  dashboard_id uuid not null references public.dashboard_documents(id) on delete cascade,
  revision_number integer not null,
  status text not null check (status in ('draft', 'published', 'archived')),
  semantic_model_id text not null,
  dataset_version_id uuid not null references public.dataset_versions(id) on delete restrict,
  spec_json jsonb not null,
  view_state_json jsonb not null default '{}'::jsonb,
  reason text,
  source text not null default 'manual' check (source in ('manual', 'copilot', 'import', 'restore')),
  created_by uuid references auth.users(id) on delete set null,
  audit_event_id uuid,
  mutable boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (dashboard_id, revision_number)
);

create table if not exists public.dashboard_pages (
  id text not null,
  dashboard_id uuid not null references public.dashboard_documents(id) on delete cascade,
  revision_id text not null references public.dashboard_revisions(id) on delete cascade,
  title text not null,
  page_order integer not null,
  layout_json jsonb not null default '{"mode":"grid_12","columns":12}'::jsonb,
  filters_json jsonb not null default '[]'::jsonb,
  widget_ids text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  primary key (revision_id, id)
);

create table if not exists public.dashboard_widgets (
  id text not null,
  dashboard_id uuid not null references public.dashboard_documents(id) on delete cascade,
  revision_id text not null references public.dashboard_revisions(id) on delete cascade,
  page_id text not null,
  widget_type text not null,
  title text not null,
  widget_json jsonb not null,
  layout_json jsonb not null,
  query_json jsonb,
  created_at timestamptz not null default now(),
  primary key (revision_id, id),
  foreign key (revision_id, page_id) references public.dashboard_pages(revision_id, id) on delete cascade
);

create table if not exists public.export_jobs (
  id text primary key,
  dashboard_id uuid references public.dashboard_documents(id) on delete set null,
  dashboard_revision_id text references public.dashboard_revisions(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  share_link_id uuid references public.share_links(id) on delete set null,
  format text not null check (format in ('pdf', 'png', 'pptx')),
  status text not null check (status in ('queued', 'rendering', 'ready', 'failed', 'expired')),
  scope text not null check (scope in ('private_workspace', 'public_share')),
  request_json jsonb not null,
  result_json jsonb,
  storage_bucket text,
  storage_path text,
  signed_url_expires_at timestamptz,
  error_message text,
  correlation_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  entity_type text not null,
  entity_id text,
  action text not null,
  result text not null check (result in ('success', 'denied', 'failed')),
  reason text,
  correlation_id text not null,
  revision_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.dashboard_documents enable row level security;
alter table public.dashboard_revisions enable row level security;
alter table public.dashboard_pages enable row level security;
alter table public.dashboard_widgets enable row level security;
alter table public.export_jobs enable row level security;
alter table public.audit_events enable row level security;

drop policy if exists "Users can manage dashboard documents" on public.dashboard_documents;
create policy "Users can manage dashboard documents"
  on public.dashboard_documents for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage dashboard revisions v2" on public.dashboard_revisions;
create policy "Users can manage dashboard revisions v2"
  on public.dashboard_revisions for all
  using (exists (select 1 from public.dashboard_documents d where d.id = dashboard_id and d.user_id = auth.uid()))
  with check (exists (select 1 from public.dashboard_documents d where d.id = dashboard_id and d.user_id = auth.uid()));

drop policy if exists "Users can manage dashboard pages v2" on public.dashboard_pages;
create policy "Users can manage dashboard pages v2"
  on public.dashboard_pages for all
  using (exists (select 1 from public.dashboard_documents d where d.id = dashboard_id and d.user_id = auth.uid()))
  with check (exists (select 1 from public.dashboard_documents d where d.id = dashboard_id and d.user_id = auth.uid()));

drop policy if exists "Users can manage dashboard widgets v2" on public.dashboard_widgets;
create policy "Users can manage dashboard widgets v2"
  on public.dashboard_widgets for all
  using (exists (select 1 from public.dashboard_documents d where d.id = dashboard_id and d.user_id = auth.uid()))
  with check (exists (select 1 from public.dashboard_documents d where d.id = dashboard_id and d.user_id = auth.uid()));

drop policy if exists "Users can manage export jobs" on public.export_jobs;
create policy "Users can manage export jobs"
  on public.export_jobs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own audit events" on public.audit_events;
create policy "Users can read own audit events"
  on public.audit_events for select
  using (auth.uid() = user_id);

create index if not exists dashboard_documents_project_idx on public.dashboard_documents(project_id, updated_at desc);
create index if not exists dashboard_revisions_dashboard_idx on public.dashboard_revisions(dashboard_id, revision_number desc);
create index if not exists dashboard_pages_dashboard_idx on public.dashboard_pages(dashboard_id, revision_id, page_order);
create index if not exists dashboard_widgets_dashboard_idx on public.dashboard_widgets(dashboard_id, revision_id, page_id);
create index if not exists export_jobs_dashboard_idx on public.export_jobs(dashboard_id, created_at desc);
create index if not exists audit_events_entity_idx on public.audit_events(entity_type, entity_id, created_at desc);

create or replace function public.restore_dashboard_revision(
  target_dashboard_id uuid,
  source_revision_id text,
  restore_reason text default 'restore'
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  document_row public.dashboard_documents%rowtype;
  source_revision public.dashboard_revisions%rowtype;
  next_revision_number integer;
  new_revision_id text;
begin
  select *
    into document_row
    from public.dashboard_documents
   where id = target_dashboard_id
   for update;

  if not found then
    raise exception 'dashboard document not found';
  end if;

  select *
    into source_revision
    from public.dashboard_revisions
   where dashboard_id = target_dashboard_id
     and id = source_revision_id;

  if not found then
    raise exception 'dashboard revision not found';
  end if;

  select coalesce(max(revision_number), 0) + 1
    into next_revision_number
    from public.dashboard_revisions
   where dashboard_id = target_dashboard_id;

  new_revision_id := target_dashboard_id::text || '_rev_' || next_revision_number::text;

  insert into public.dashboard_revisions (
    id, dashboard_id, revision_number, status, semantic_model_id, dataset_version_id,
    spec_json, view_state_json, reason, source, created_by, mutable, published_at
  )
  values (
    new_revision_id, target_dashboard_id, next_revision_number, 'published',
    source_revision.semantic_model_id, source_revision.dataset_version_id,
    source_revision.spec_json, source_revision.view_state_json,
    restore_reason, 'restore', auth.uid(), false, now()
  );

  insert into public.dashboard_pages (id, dashboard_id, revision_id, title, page_order, layout_json, filters_json, widget_ids)
  select id, dashboard_id, new_revision_id, title, page_order, layout_json, filters_json, widget_ids
    from public.dashboard_pages
   where revision_id = source_revision_id;

  insert into public.dashboard_widgets (id, dashboard_id, revision_id, page_id, widget_type, title, widget_json, layout_json, query_json)
  select id, dashboard_id, new_revision_id, page_id, widget_type, title, widget_json, layout_json, query_json
    from public.dashboard_widgets
   where revision_id = source_revision_id;

  update public.dashboard_documents
     set current_revision_id = new_revision_id,
         published_revision_id = new_revision_id,
         updated_at = now()
   where id = target_dashboard_id;

  update public.dashboard_specs
     set active_revision_id = new_revision_id,
         spec_json = source_revision.spec_json,
         view_state_json = source_revision.view_state_json,
         updated_at = now()
   where id = target_dashboard_id;

  insert into public.audit_events (user_id, project_id, entity_type, entity_id, action, result, reason, correlation_id, revision_id)
  values (auth.uid(), document_row.project_id, 'dashboard', target_dashboard_id::text, 'dashboard.revision.restore', 'success', restore_reason, 'rpc_restore_' || txid_current()::text, new_revision_id);

  return jsonb_build_object('dashboardId', target_dashboard_id, 'revisionId', new_revision_id, 'revisionNumber', next_revision_number);
end;
$$;

grant execute on function public.restore_dashboard_revision(uuid, text, text) to authenticated;
