create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.datasets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  file_name text not null,
  file_type text not null,
  row_count integer not null default 0,
  column_count integer not null default 0,
  storage_path text,
  profile_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.dataset_columns (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  original_name text not null,
  display_name text not null,
  inferred_type text not null,
  semantic_type text not null,
  profile_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.dashboard_specs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  title text not null,
  spec_json jsonb not null,
  view_state_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dashboard_versions (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.dashboard_specs(id) on delete cascade,
  spec_json jsonb not null,
  change_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.presentations (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.dashboard_specs(id) on delete cascade,
  title text not null,
  spec_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.presentation_versions (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null references public.presentations(id) on delete cascade,
  spec_json jsonb not null,
  change_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  dashboard_id uuid references public.dashboard_specs(id) on delete set null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  structured_action_json jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.dashboard_specs(id) on delete cascade,
  token text not null unique,
  access text not null check (access in ('public', 'private', 'password')),
  password_hash text,
  expires_at timestamptz,
  allow_filters boolean not null default true,
  allow_download boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.datasets enable row level security;
alter table public.dataset_columns enable row level security;
alter table public.dashboard_specs enable row level security;
alter table public.dashboard_versions enable row level security;
alter table public.presentations enable row level security;
alter table public.presentation_versions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.share_links enable row level security;

create policy "Users can manage their projects"
  on public.projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can read project datasets"
  on public.datasets for all
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Users can manage dashboards"
  on public.dashboard_specs for all
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

create policy "Public share links can be read"
  on public.share_links for select
  using (access = 'public' and (expires_at is null or expires_at > now()));
