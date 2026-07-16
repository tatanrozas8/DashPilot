create extension if not exists pgcrypto;

alter table public.share_links add column if not exists token_hash text;
alter table public.share_links add column if not exists password_salt text;
alter table public.share_links add column if not exists scopes text[] not null default array['view_dashboard']::text[];
alter table public.share_links add column if not exists revoked_at timestamptz;
alter table public.share_links add column if not exists last_accessed_at timestamptz;

update public.share_links
   set token_hash = encode(digest(token, 'sha256'), 'hex')
 where token_hash is null
   and token is not null;

alter table public.share_links alter column token drop not null;

update public.share_links
   set token = null
 where token_hash is not null;

create unique index if not exists share_links_token_hash_unique
  on public.share_links(token_hash)
  where token_hash is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'share_links_valid_public_scopes'
      and conrelid = 'public.share_links'::regclass
  ) then
    alter table public.share_links
      add constraint share_links_valid_public_scopes
      check (
        scopes @> array['view_dashboard']::text[]
        and scopes <@ array['view_dashboard', 'use_filters', 'export_snapshot']::text[]
      );
  end if;
end;
$$;

create table if not exists public.share_widget_results (
  id uuid primary key default gen_random_uuid(),
  share_link_id uuid not null references public.share_links(id) on delete cascade,
  widget_id text not null,
  revision_id text not null,
  result_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (share_link_id, widget_id, revision_id)
);

create table if not exists public.public_share_access_logs (
  id uuid primary key default gen_random_uuid(),
  share_link_id uuid references public.share_links(id) on delete set null,
  token_hash_prefix text not null,
  action text not null check (action in ('view_dashboard', 'use_filters', 'export_snapshot')),
  outcome text not null check (outcome in ('granted', 'denied', 'rate_limited')),
  ip_hash text,
  user_agent_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.share_widget_results enable row level security;
alter table public.public_share_access_logs enable row level security;

drop policy if exists "Users can manage share widget results" on public.share_widget_results;
create policy "Users can manage share widget results"
  on public.share_widget_results for all
  using (
    exists (
      select 1
      from public.share_links sl
      where sl.id = share_link_id
        and sl.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.share_links sl
      where sl.id = share_link_id
        and sl.user_id = auth.uid()
    )
  );

drop policy if exists "Users can read own public share access logs" on public.public_share_access_logs;
create policy "Users can read own public share access logs"
  on public.public_share_access_logs for select
  using (
    exists (
      select 1
      from public.share_links sl
      where sl.id = share_link_id
        and sl.user_id = auth.uid()
    )
  );

drop function if exists public.get_public_shared_dashboard(text);
drop function if exists public.get_public_shared_dashboard(text, text);
drop function if exists public.get_public_shared_dashboard(text, text, text[], jsonb);

create or replace function public.get_public_shared_dashboard(
  share_token text,
  share_password text default null,
  requested_scopes text[] default array['view_dashboard']::text[],
  requested_filters jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  link_row public.share_links%rowtype;
  dashboard_row public.dashboard_specs%rowtype;
  token_hash_value text;
  token_hash_prefix_value text;
  request_headers jsonb := '{}'::jsonb;
  raw_headers text;
  request_ip_hash text;
  request_user_agent_hash text;
  failed_attempts integer := 0;
  normalized_scopes text[] := coalesce(requested_scopes, array['view_dashboard']::text[]);
  allowed_filter_fields text[];
  filter_item jsonb;
  widget_results jsonb := '[]'::jsonb;
begin
  if share_token is null or length(share_token) < 16 then
    return null;
  end if;

  token_hash_value := encode(digest(share_token, 'sha256'), 'hex');
  token_hash_prefix_value := left(token_hash_value, 16);

  begin
    raw_headers := current_setting('request.headers', true);
    if raw_headers is not null and raw_headers <> '' then
      request_headers := raw_headers::jsonb;
    end if;
  exception when others then
    request_headers := '{}'::jsonb;
  end;

  request_ip_hash := nullif(encode(digest(coalesce(request_headers ->> 'x-forwarded-for', request_headers ->> 'cf-connecting-ip', ''), 'sha256'), 'hex'), encode(digest('', 'sha256'), 'hex'));
  request_user_agent_hash := nullif(encode(digest(coalesce(request_headers ->> 'user-agent', ''), 'sha256'), 'hex'), encode(digest('', 'sha256'), 'hex'));

  select count(*)
    into failed_attempts
    from public.public_share_access_logs
   where token_hash_prefix = token_hash_prefix_value
     and coalesce(ip_hash, '') = coalesce(request_ip_hash, '')
     and outcome in ('denied', 'rate_limited')
     and created_at > now() - interval '10 minutes';

  if failed_attempts >= 10 then
    insert into public.public_share_access_logs (token_hash_prefix, action, outcome, ip_hash, user_agent_hash, metadata)
    values (token_hash_prefix_value, 'view_dashboard', 'rate_limited', request_ip_hash, request_user_agent_hash, jsonb_build_object('reason', 'too_many_failed_attempts'));
    return null;
  end if;

  select *
    into link_row
    from public.share_links
   where token_hash = token_hash_value
   limit 1;

  if not found
     or link_row.is_active is false
     or link_row.revoked_at is not null
     or (link_row.expires_at is not null and link_row.expires_at <= now()) then
    insert into public.public_share_access_logs (share_link_id, token_hash_prefix, action, outcome, ip_hash, user_agent_hash, metadata)
    values (case when found then link_row.id else null end, token_hash_prefix_value, 'view_dashboard', 'denied', request_ip_hash, request_user_agent_hash, jsonb_build_object('reason', 'unavailable'));
    return null;
  end if;

  if not (normalized_scopes @> array['view_dashboard']::text[])
     or not (normalized_scopes <@ link_row.scopes) then
    insert into public.public_share_access_logs (share_link_id, token_hash_prefix, action, outcome, ip_hash, user_agent_hash, metadata)
    values (link_row.id, token_hash_prefix_value, 'view_dashboard', 'denied', request_ip_hash, request_user_agent_hash, jsonb_build_object('reason', 'scope_not_allowed'));
    return null;
  end if;

  if link_row.access = 'password' or link_row.password_hash is not null then
    if link_row.password_hash is null
       or link_row.password_salt is null
       or encode(digest(coalesce(share_password, '') || link_row.password_salt, 'sha256'), 'hex') <> link_row.password_hash then
      insert into public.public_share_access_logs (share_link_id, token_hash_prefix, action, outcome, ip_hash, user_agent_hash, metadata)
      values (link_row.id, token_hash_prefix_value, 'view_dashboard', 'denied', request_ip_hash, request_user_agent_hash, jsonb_build_object('reason', 'invalid_password'));
      return null;
    end if;
  end if;

  select *
    into dashboard_row
    from public.dashboard_specs
   where id = link_row.dashboard_id
     and status = 'active'
   limit 1;

  if not found then
    insert into public.public_share_access_logs (share_link_id, token_hash_prefix, action, outcome, ip_hash, user_agent_hash, metadata)
    values (link_row.id, token_hash_prefix_value, 'view_dashboard', 'denied', request_ip_hash, request_user_agent_hash, jsonb_build_object('reason', 'dashboard_unavailable'));
    return null;
  end if;

  if jsonb_typeof(coalesce(requested_filters, '[]'::jsonb)) <> 'array' then
    insert into public.public_share_access_logs (share_link_id, token_hash_prefix, action, outcome, ip_hash, user_agent_hash, metadata)
    values (link_row.id, token_hash_prefix_value, 'use_filters', 'denied', request_ip_hash, request_user_agent_hash, jsonb_build_object('reason', 'invalid_filter_payload'));
    return null;
  end if;

  allowed_filter_fields := coalesce(
    array(select filter_config ->> 'field' from jsonb_array_elements(coalesce(dashboard_row.spec_json -> 'globalFilters', '[]'::jsonb)) as filter_config),
    array[]::text[]
  );

  for filter_item in select * from jsonb_array_elements(coalesce(requested_filters, '[]'::jsonb))
  loop
    if not ('use_filters' = any(link_row.scopes))
       or not (filter_item ->> 'field' = any(allowed_filter_fields))
       or not (filter_item ->> 'operator' = any(array['eq', 'in', 'between', 'range']::text[])) then
      insert into public.public_share_access_logs (share_link_id, token_hash_prefix, action, outcome, ip_hash, user_agent_hash, metadata)
      values (link_row.id, token_hash_prefix_value, 'use_filters', 'denied', request_ip_hash, request_user_agent_hash, jsonb_build_object('reason', 'filter_not_allowed'));
      return null;
    end if;
  end loop;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'widgetId', swr.widget_id,
        'revisionId', swr.revision_id,
        'rows', swr.result_json
      )
      order by swr.created_at, swr.widget_id
    ),
    '[]'::jsonb
  )
    into widget_results
    from public.share_widget_results swr
   where swr.share_link_id = link_row.id
     and exists (
       select 1
       from jsonb_array_elements(coalesce(dashboard_row.spec_json -> 'widgets', '[]'::jsonb)) as widget_config
       where widget_config ->> 'id' = swr.widget_id
     );

  update public.share_links
     set last_accessed_at = now()
   where id = link_row.id;

  insert into public.public_share_access_logs (share_link_id, token_hash_prefix, action, outcome, ip_hash, user_agent_hash, metadata)
  values (link_row.id, token_hash_prefix_value, 'view_dashboard', 'granted', request_ip_hash, request_user_agent_hash, jsonb_build_object('widgetCount', jsonb_array_length(widget_results)));

  return jsonb_build_object(
    'link', jsonb_build_object(
      'id', link_row.id,
      'dashboardId', link_row.dashboard_id,
      'access', link_row.access,
      'expiresAt', link_row.expires_at,
      'allowFilters', 'use_filters' = any(link_row.scopes),
      'allowDownload', 'export_snapshot' = any(link_row.scopes),
      'scopes', link_row.scopes,
      'passwordRequired', link_row.password_hash is not null,
      'createdAt', link_row.created_at
    ),
    'dashboard', dashboard_row.spec_json,
    'viewState', dashboard_row.view_state_json,
    'widgetResults', widget_results,
    'allowedFilters',
      case
        when 'use_filters' = any(link_row.scopes) then coalesce(dashboard_row.spec_json -> 'globalFilters', '[]'::jsonb)
        else '[]'::jsonb
      end
  );
end;
$$;

grant execute on function public.get_public_shared_dashboard(text, text, text[], jsonb) to anon, authenticated;
