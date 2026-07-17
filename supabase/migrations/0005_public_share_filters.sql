alter table public.share_links add column if not exists allowed_filters_json jsonb not null default '[]'::jsonb;

create table if not exists public.share_filter_snapshots (
  id uuid primary key default gen_random_uuid(),
  share_link_id uuid not null references public.share_links(id) on delete cascade,
  filter_key text not null,
  filters_json jsonb not null default '[]'::jsonb,
  revision_id text not null,
  created_at timestamptz not null default now(),
  unique (share_link_id, filter_key)
);

alter table public.share_filter_snapshots enable row level security;

drop policy if exists "Users can manage share filter snapshots" on public.share_filter_snapshots;
create policy "Users can manage share filter snapshots"
  on public.share_filter_snapshots for all
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
  selected_snapshot public.share_filter_snapshots%rowtype;
  token_hash_value text;
  token_hash_prefix_value text;
  request_headers jsonb := '{}'::jsonb;
  raw_headers text;
  request_ip_hash text;
  request_user_agent_hash text;
  failed_attempts integer := 0;
  normalized_scopes text[] := coalesce(requested_scopes, array['view_dashboard']::text[]);
  allowed_filters jsonb := '[]'::jsonb;
  filter_item jsonb;
  filter_value jsonb;
  filter_values jsonb;
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

  allowed_filters := coalesce(link_row.allowed_filters_json, '[]'::jsonb);

  if jsonb_typeof(coalesce(requested_filters, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(requested_filters, '[]'::jsonb)) > 1 then
    insert into public.public_share_access_logs (share_link_id, token_hash_prefix, action, outcome, ip_hash, user_agent_hash, metadata)
    values (link_row.id, token_hash_prefix_value, 'use_filters', 'denied', request_ip_hash, request_user_agent_hash, jsonb_build_object('reason', 'invalid_filter_payload'));
    return null;
  end if;

  if jsonb_array_length(coalesce(requested_filters, '[]'::jsonb)) > 0
     and not ('use_filters' = any(link_row.scopes)) then
    insert into public.public_share_access_logs (share_link_id, token_hash_prefix, action, outcome, ip_hash, user_agent_hash, metadata)
    values (link_row.id, token_hash_prefix_value, 'use_filters', 'denied', request_ip_hash, request_user_agent_hash, jsonb_build_object('reason', 'filters_disabled'));
    return null;
  end if;

  for filter_item in select * from jsonb_array_elements(coalesce(requested_filters, '[]'::jsonb))
  loop
    if jsonb_typeof(filter_item) <> 'object'
       or not (filter_item ->> 'operator' = any(array['eq', 'in']::text[]))
       or not exists (
         select 1
         from jsonb_array_elements(allowed_filters) as allowed_filter
         where allowed_filter ->> 'field' = filter_item ->> 'field'
       ) then
      insert into public.public_share_access_logs (share_link_id, token_hash_prefix, action, outcome, ip_hash, user_agent_hash, metadata)
      values (link_row.id, token_hash_prefix_value, 'use_filters', 'denied', request_ip_hash, request_user_agent_hash, jsonb_build_object('reason', 'filter_not_allowed'));
      return null;
    end if;

    filter_values := case
      when filter_item ->> 'operator' = 'in' then filter_item -> 'value'
      else jsonb_build_array(filter_item -> 'value')
    end;

    if jsonb_typeof(filter_values) <> 'array'
       or jsonb_array_length(filter_values) <> 1 then
      insert into public.public_share_access_logs (share_link_id, token_hash_prefix, action, outcome, ip_hash, user_agent_hash, metadata)
      values (link_row.id, token_hash_prefix_value, 'use_filters', 'denied', request_ip_hash, request_user_agent_hash, jsonb_build_object('reason', 'invalid_filter_value'));
      return null;
    end if;

    for filter_value in select * from jsonb_array_elements(filter_values)
    loop
      if length(filter_value #>> '{}') > 120
         or not exists (
           select 1
           from jsonb_array_elements(allowed_filters) as allowed_filter
           join jsonb_array_elements(coalesce(allowed_filter -> 'allowedValues', '[]'::jsonb)) as allowed_value on true
           where allowed_filter ->> 'field' = filter_item ->> 'field'
             and allowed_value -> 'value' = filter_value
         ) then
        insert into public.public_share_access_logs (share_link_id, token_hash_prefix, action, outcome, ip_hash, user_agent_hash, metadata)
        values (link_row.id, token_hash_prefix_value, 'use_filters', 'denied', request_ip_hash, request_user_agent_hash, jsonb_build_object('reason', 'filter_value_not_allowed'));
        return null;
      end if;
    end loop;
  end loop;

  select *
    into selected_snapshot
    from public.share_filter_snapshots
   where share_link_id = link_row.id
     and filters_json = coalesce(requested_filters, '[]'::jsonb)
   limit 1;

  if not found and jsonb_array_length(coalesce(requested_filters, '[]'::jsonb)) = 0 then
    select swr.revision_id
      into selected_snapshot.revision_id
      from public.share_widget_results swr
     where swr.share_link_id = link_row.id
     order by swr.created_at, swr.revision_id
     limit 1;
  end if;

  if selected_snapshot.revision_id is null then
    insert into public.public_share_access_logs (share_link_id, token_hash_prefix, action, outcome, ip_hash, user_agent_hash, metadata)
    values (link_row.id, token_hash_prefix_value, 'use_filters', 'denied', request_ip_hash, request_user_agent_hash, jsonb_build_object('reason', 'snapshot_not_allowed'));
    return null;
  end if;

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
     and swr.revision_id = selected_snapshot.revision_id
     and exists (
       select 1
       from jsonb_array_elements(coalesce(dashboard_row.spec_json -> 'widgets', '[]'::jsonb)) as widget_config
       where widget_config ->> 'id' = swr.widget_id
     );

  update public.share_links
     set last_accessed_at = now()
   where id = link_row.id;

  insert into public.public_share_access_logs (share_link_id, token_hash_prefix, action, outcome, ip_hash, user_agent_hash, metadata)
  values (link_row.id, token_hash_prefix_value, case when jsonb_array_length(coalesce(requested_filters, '[]'::jsonb)) > 0 then 'use_filters' else 'view_dashboard' end, 'granted', request_ip_hash, request_user_agent_hash, jsonb_build_object('widgetCount', jsonb_array_length(widget_results)));

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
        when 'use_filters' = any(link_row.scopes) then allowed_filters
        else '[]'::jsonb
      end
  );
end;
$$;

grant execute on function public.get_public_shared_dashboard(text, text, text[], jsonb) to anon, authenticated;
