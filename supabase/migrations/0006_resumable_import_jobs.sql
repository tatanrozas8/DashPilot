alter table public.import_jobs add column if not exists project_id uuid references public.projects(id) on delete cascade;
alter table public.import_jobs add column if not exists dataset_version_id uuid references public.dataset_versions(id) on delete cascade;
alter table public.import_jobs add column if not exists idempotency_key text;
alter table public.import_jobs add column if not exists stage text not null default 'upload_signed';
alter table public.import_jobs add column if not exists attempts integer not null default 0;
alter table public.import_jobs add column if not exists max_attempts integer not null default 3;
alter table public.import_jobs add column if not exists lease_owner text;
alter table public.import_jobs add column if not exists heartbeat_at timestamptz;
alter table public.import_jobs add column if not exists next_run_at timestamptz;
alter table public.import_jobs add column if not exists cancelled_at timestamptz;
alter table public.import_jobs add column if not exists dead_letter_at timestamptz;
alter table public.import_jobs add column if not exists updated_at timestamptz not null default now();
alter table public.import_jobs add column if not exists file_name text;
alter table public.import_jobs add column if not exists file_type text;
alter table public.import_jobs add column if not exists file_size bigint not null default 0;
alter table public.import_jobs add column if not exists declared_mime_type text;
alter table public.import_jobs add column if not exists detected_mime_type text;
alter table public.import_jobs add column if not exists storage_bucket text not null default 'dashboard-files';
alter table public.import_jobs add column if not exists storage_path text;
alter table public.import_jobs add column if not exists upload_protocol text not null default 'tus';
alter table public.import_jobs add column if not exists upload_session_json jsonb not null default '{}'::jsonb;
alter table public.import_jobs add column if not exists retention_policy text not null default 'retain_original_private';
alter table public.import_jobs add column if not exists retained_until timestamptz;
alter table public.import_jobs add column if not exists scanner_provider text;
alter table public.import_jobs add column if not exists scan_status text not null default 'pending';
alter table public.import_jobs add column if not exists scan_result_json jsonb not null default '{}'::jsonb;
alter table public.import_jobs add column if not exists validation_json jsonb not null default '[]'::jsonb;
alter table public.import_jobs add column if not exists preview_json jsonb not null default '{}'::jsonb;
alter table public.import_jobs add column if not exists completed_stages text[] not null default '{}'::text[];
alter table public.import_jobs add column if not exists columnar_format text;
alter table public.import_jobs add column if not exists columnar_storage_path text;
alter table public.import_jobs add column if not exists active_artifact_path text;

alter table public.import_jobs drop constraint if exists import_jobs_status_check;
alter table public.import_jobs add constraint import_jobs_status_check check (
  status in ('created', 'uploading', 'queued', 'scanning', 'processing', 'converting', 'validating', 'ready', 'retrying', 'cancelled', 'failed', 'dead_letter')
);

alter table public.import_jobs drop constraint if exists import_jobs_stage_check;
alter table public.import_jobs add constraint import_jobs_stage_check check (
  stage in ('upload_signed', 'upload_received', 'security_validation', 'antivirus_scan', 'parse_source', 'profile_dataset', 'convert_columnar', 'persist_artifacts', 'activate_version')
);

alter table public.import_jobs drop constraint if exists import_jobs_scan_status_check;
alter table public.import_jobs add constraint import_jobs_scan_status_check check (
  scan_status in ('pending', 'clean', 'infected', 'failed')
);

alter table public.import_jobs drop constraint if exists import_jobs_retention_policy_check;
alter table public.import_jobs add constraint import_jobs_retention_policy_check check (
  retention_policy in ('retain_original_private', 'delete_original_after_import')
);

alter table public.import_jobs drop constraint if exists import_jobs_progress_check;
alter table public.import_jobs add constraint import_jobs_progress_check check (progress between 0 and 100);

create unique index if not exists import_jobs_idempotency_unique
  on public.import_jobs(user_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists import_jobs_queue_idx
  on public.import_jobs(status, next_run_at, created_at)
  where status in ('queued', 'retrying');

create index if not exists import_jobs_heartbeat_idx
  on public.import_jobs(status, heartbeat_at)
  where status in ('scanning', 'processing', 'converting', 'validating');

create index if not exists import_jobs_project_idx on public.import_jobs(project_id, created_at desc);

drop policy if exists "Users can manage own import jobs" on public.import_jobs;
create policy "Users can manage own import jobs"
  on public.import_jobs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.touch_import_job_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  if new.status = 'dead_letter' and new.dead_letter_at is null then
    new.dead_letter_at = now();
  end if;
  if new.status = 'cancelled' and new.cancelled_at is null then
    new.cancelled_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists import_jobs_touch_updated_at on public.import_jobs;
create trigger import_jobs_touch_updated_at
before update on public.import_jobs
for each row execute function public.touch_import_job_updated_at();
