-- Knowledge / Prompt Auto Update v1
-- Review-gated cloud updates with Fresh -> Stable rollout and prompt rule versioning.
-- Additive PWA-only migration. No Windows updater/release changes.

alter table public.knowledge_catalog
    add column if not exists source_urls text[] not null default '{}';

alter table public.knowledge_catalog
    add column if not exists source_summary text;

alter table public.knowledge_catalog
    add column if not exists source_checked_at timestamptz;

alter table public.knowledge_catalog
    add column if not exists catalog_version bigint not null default 1;

alter table public.knowledge_catalog
    drop constraint if exists knowledge_catalog_source_summary_length;

alter table public.knowledge_catalog
    add constraint knowledge_catalog_source_summary_length
    check (source_summary is null or length(source_summary) <= 1000);

alter table public.knowledge_catalog
    drop constraint if exists knowledge_catalog_catalog_version_check;

alter table public.knowledge_catalog
    add constraint knowledge_catalog_catalog_version_check
    check (catalog_version >= 1);

create index if not exists knowledge_catalog_channel_version_idx
    on public.knowledge_catalog (release_channel, catalog_version desc, updated_at desc)
    where status = 'active';

alter table public.knowledge_refresh_requests
    add column if not exists started_at timestamptz;

alter table public.knowledge_refresh_requests
    add column if not exists research_summary text;

alter table public.knowledge_refresh_requests
    add column if not exists published_knowledge_count integer not null default 0;

alter table public.knowledge_refresh_requests
    add column if not exists published_prompt_count integer not null default 0;

alter table public.knowledge_refresh_requests
    add column if not exists published_version bigint;

alter table public.knowledge_refresh_requests
    drop constraint if exists knowledge_refresh_requests_summary_length;

alter table public.knowledge_refresh_requests
    add constraint knowledge_refresh_requests_summary_length
    check (research_summary is null or length(research_summary) <= 2000);

alter table public.knowledge_refresh_requests
    drop constraint if exists knowledge_refresh_requests_counts_check;

alter table public.knowledge_refresh_requests
    add constraint knowledge_refresh_requests_counts_check
    check (published_knowledge_count >= 0 and published_prompt_count >= 0);

alter table public.knowledge_refresh_requests
    drop constraint if exists knowledge_refresh_requests_version_check;

alter table public.knowledge_refresh_requests
    add constraint knowledge_refresh_requests_version_check
    check (published_version is null or published_version >= 1);

create table if not exists public.prompt_optimization_catalog (
    id uuid primary key default gen_random_uuid(),
    key text not null unique,
    provider text not null check (provider in ('all', 'chatgpt', 'claude', 'gemini')),
    plan text not null check (plan in ('all', 'free', 'paid')),
    task text not null check (task in ('all', 'title', 'article', 'image', 'social', 'promotion')),
    rules text[] not null default '{}',
    source_urls text[] not null default '{}',
    source_summary text,
    priority smallint not null default 70 check (priority between 0 and 100),
    release_channel text not null default 'both' check (release_channel in ('both', 'fresh_first')),
    stable_available_at timestamptz not null default now(),
    catalog_version bigint not null default 1 check (catalog_version >= 1),
    status text not null default 'active' check (status in ('active', 'draft', 'disabled')),
    created_by uuid references public.profiles(id),
    source_checked_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint prompt_optimization_key_length check (length(key) between 1 and 180),
    constraint prompt_optimization_source_summary_length check (source_summary is null or length(source_summary) <= 1000)
);

create index if not exists prompt_optimization_active_lookup_idx
    on public.prompt_optimization_catalog (status, provider, plan, task, priority desc, updated_at desc);

create index if not exists prompt_optimization_channel_version_idx
    on public.prompt_optimization_catalog (release_channel, catalog_version desc, updated_at desc)
    where status = 'active';

alter table public.prompt_optimization_catalog enable row level security;
alter table public.prompt_optimization_catalog force row level security;
revoke all on table public.prompt_optimization_catalog from public, anon, authenticated;

create or replace function private.aas_json_text_array(
    p_value jsonb,
    p_max_items integer,
    p_max_chars integer
)
returns text[]
language plpgsql
immutable
set search_path to ''
as $function$
declare
    result text[] := '{}';
begin
    if p_value is null or p_value = 'null'::jsonb then
        return result;
    end if;
    if jsonb_typeof(p_value) <> 'array' then
        raise exception 'expected JSON array' using errcode = '22023';
    end if;
    if jsonb_array_length(p_value) > p_max_items then
        raise exception 'too many array items' using errcode = '22023';
    end if;
    if exists (
        select 1
        from jsonb_array_elements_text(p_value) as item(value)
        where length(trim(item.value)) > p_max_chars
    ) then
        raise exception 'array item is too long' using errcode = '22023';
    end if;

    select coalesce(array_agg(trim(item.value) order by item.ordinality)
        filter (where trim(item.value) <> ''), '{}')
    into result
    from jsonb_array_elements_text(p_value) with ordinality as item(value, ordinality);

    return result;
end;
$function$;

revoke all on function private.aas_json_text_array(jsonb, integer, integer)
from public, anon, authenticated;

create or replace function public.list_my_active_knowledge_catalog_v2()
returns table (
    key text,
    kind text,
    label text,
    parent_label text,
    aliases text[],
    guidance text[],
    deliverables text[],
    cautions text[],
    tasks text[],
    priority smallint,
    status text,
    catalog_version bigint,
    source_urls text[],
    source_summary text,
    source_checked_at timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    member_access boolean := false;
begin
    if current_user_id is null
       or not (select private.is_active_profile())
       or not (select public.can_access_product('AAS-PWA-BETA'))
    then
        raise exception 'active PWA access required' using errcode = '42501';
    end if;

    member_access := (select private.is_active_admin())
        or (select public.has_active_creator_membership());

    return query
    select
        catalog.key,
        catalog.kind,
        catalog.label,
        catalog.parent_label,
        catalog.aliases,
        catalog.guidance,
        catalog.deliverables,
        catalog.cautions,
        catalog.tasks,
        catalog.priority,
        catalog.status,
        catalog.catalog_version,
        catalog.source_urls,
        catalog.source_summary,
        catalog.source_checked_at
    from public.knowledge_catalog as catalog
    where catalog.status = 'active'
      and (
          catalog.release_channel = 'both'
          or member_access
          or catalog.stable_available_at <= now()
      )
    order by catalog.priority desc, catalog.catalog_version desc, catalog.key
    limit 500;
end;
$function$;

create or replace function public.list_my_active_prompt_optimizations()
returns table (
    key text,
    provider text,
    plan text,
    task text,
    rules text[],
    priority smallint,
    catalog_version bigint,
    source_urls text[],
    source_summary text,
    source_checked_at timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    member_access boolean := false;
begin
    if current_user_id is null
       or not (select private.is_active_profile())
       or not (select public.can_access_product('AAS-PWA-BETA'))
    then
        raise exception 'active PWA access required' using errcode = '42501';
    end if;

    member_access := (select private.is_active_admin())
        or (select public.has_active_creator_membership());

    return query
    select
        item.key,
        item.provider,
        item.plan,
        item.task,
        item.rules,
        item.priority,
        item.catalog_version,
        item.source_urls,
        item.source_summary,
        item.source_checked_at
    from public.prompt_optimization_catalog as item
    where item.status = 'active'
      and (
          item.release_channel = 'both'
          or member_access
          or item.stable_available_at <= now()
      )
    order by item.priority desc, item.catalog_version desc, item.key
    limit 300;
end;
$function$;

create or replace function public.get_my_knowledge_runtime_state()
returns table (
    channel text,
    refresh_hours integer,
    effective_version bigint,
    last_published_at timestamptz,
    next_refresh_due_at timestamptz
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    member_access boolean := false;
    channel_value text;
    knowledge_version bigint := 1;
    prompt_version bigint := 1;
begin
    if current_user_id is null
       or not (select private.is_active_profile())
       or not (select public.can_access_product('AAS-PWA-BETA'))
    then
        raise exception 'active PWA access required' using errcode = '42501';
    end if;

    member_access := (select private.is_active_admin())
        or (select public.has_active_creator_membership());
    channel_value := case when member_access then 'fresh' else 'stable' end;

    select coalesce(max(catalog.catalog_version), 1)
    into knowledge_version
    from public.knowledge_catalog as catalog
    where catalog.status = 'active'
      and (
          catalog.release_channel = 'both'
          or member_access
          or catalog.stable_available_at <= now()
      );

    select coalesce(max(item.catalog_version), 1)
    into prompt_version
    from public.prompt_optimization_catalog as item
    where item.status = 'active'
      and (
          item.release_channel = 'both'
          or member_access
          or item.stable_available_at <= now()
      );

    return query
    select
        state.channel,
        state.refresh_hours,
        greatest(state.current_version, knowledge_version, prompt_version),
        state.last_published_at,
        state.next_refresh_due_at
    from public.knowledge_refresh_channels as state
    where state.channel = channel_value;
end;
$function$;

create or replace function public.admin_list_knowledge_refresh_requests(
    p_status text default null,
    p_limit integer default 50
)
returns table (
    id bigint,
    channel text,
    requested_at timestamptz,
    started_at timestamptz,
    status text,
    completed_at timestamptz,
    research_summary text,
    published_knowledge_count integer,
    published_prompt_count integer,
    published_version bigint,
    error_message text
)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
    if (select auth.uid()) is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode = '42501';
    end if;
    if p_status is not null
       and p_status not in ('pending', 'processing', 'completed', 'failed', 'cancelled')
    then
        raise exception 'invalid refresh status' using errcode = '22023';
    end if;
    if p_limit is null or p_limit < 1 or p_limit > 200 then
        raise exception 'invalid refresh limit' using errcode = '22023';
    end if;

    return query
    select
        request.id,
        request.channel,
        request.requested_at,
        request.started_at,
        request.status,
        request.completed_at,
        request.research_summary,
        request.published_knowledge_count,
        request.published_prompt_count,
        request.published_version,
        request.error_message
    from public.knowledge_refresh_requests as request
    where p_status is null or request.status = p_status
    order by
        case request.status
            when 'processing' then 1
            when 'pending' then 2
            when 'failed' then 3
            else 4
        end,
        request.requested_at desc
    limit p_limit;
end;
$function$;

create or replace function public.admin_request_knowledge_refresh(p_channel text)
returns bigint
language plpgsql
security definer
set search_path to ''
as $function$
declare
    channel_value text := lower(trim(coalesce(p_channel, '')));
    request_id bigint;
begin
    if (select auth.uid()) is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode = '42501';
    end if;
    if channel_value not in ('stable', 'fresh') then
        raise exception 'invalid knowledge refresh channel' using errcode = '22023';
    end if;

    select request.id
    into request_id
    from public.knowledge_refresh_requests as request
    where request.channel = channel_value
      and request.status in ('pending', 'processing')
    order by request.requested_at desc
    limit 1;

    if request_id is null then
        insert into public.knowledge_refresh_requests (channel)
        values (channel_value)
        returning id into request_id;
    end if;

    update public.knowledge_refresh_channels as refresh_channel
    set
        last_refresh_requested_at = now(),
        next_refresh_due_at = now() + make_interval(hours => refresh_channel.refresh_hours),
        updated_at = now()
    where refresh_channel.channel = channel_value;

    return request_id;
end;
$function$;

create or replace function public.admin_start_knowledge_refresh(p_request_id bigint)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
    current_status text;
begin
    if (select auth.uid()) is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode = '42501';
    end if;

    select request.status
    into current_status
    from public.knowledge_refresh_requests as request
    where request.id = p_request_id
    for update;

    if not found then
        raise exception 'refresh request not found' using errcode = 'P0002';
    end if;
    if current_status not in ('pending', 'processing') then
        raise exception 'refresh request cannot be started' using errcode = '22023';
    end if;

    update public.knowledge_refresh_requests
    set
        status = 'processing',
        started_at = coalesce(started_at, now()),
        error_message = null
    where id = p_request_id;
end;
$function$;

create or replace function public.admin_fail_knowledge_refresh(
    p_request_id bigint,
    p_error_message text
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
    if (select auth.uid()) is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode = '42501';
    end if;

    update public.knowledge_refresh_requests
    set
        status = 'failed',
        completed_at = now(),
        error_message = left(nullif(trim(coalesce(p_error_message, '')), ''), 1000)
    where id = p_request_id
      and status in ('pending', 'processing');

    if not found then
        raise exception 'refresh request not found or not active' using errcode = 'P0002';
    end if;
end;
$function$;

create or replace function public.admin_publish_knowledge_refresh_bundle(
    p_request_id bigint,
    p_bundle jsonb
)
returns table (
    channel text,
    published_version bigint,
    knowledge_count integer,
    prompt_count integer
)
language plpgsql
security definer
set search_path to ''
as $function$
#variable_conflict use_column
declare
    admin_id uuid := (select auth.uid());
    request_row public.knowledge_refresh_requests%rowtype;
    channel_row public.knowledge_refresh_channels%rowtype;
    bundle jsonb := coalesce(p_bundle, '{}'::jsonb);
    knowledge_items jsonb := coalesce(bundle -> 'knowledge_rules', '[]'::jsonb);
    prompt_items jsonb := coalesce(bundle -> 'prompt_optimizations', '[]'::jsonb);
    item jsonb;
    clean_key text;
    clean_kind text;
    clean_label text;
    clean_parent text;
    clean_provider text;
    clean_plan text;
    clean_task text;
    clean_summary text;
    aliases_value text[];
    guidance_value text[];
    deliverables_value text[];
    cautions_value text[];
    tasks_value text[];
    rules_value text[];
    source_urls_value text[];
    priority_value integer;
    next_version bigint;
    knowledge_count_value integer := 0;
    prompt_count_value integer := 0;
    release_value text;
    stable_at timestamptz;
    stable_delay_hours integer := 168;
begin
    if admin_id is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode = '42501';
    end if;
    if jsonb_typeof(bundle) <> 'object' then
        raise exception 'refresh bundle must be a JSON object' using errcode = '22023';
    end if;
    if jsonb_typeof(knowledge_items) <> 'array' or jsonb_typeof(prompt_items) <> 'array' then
        raise exception 'refresh bundle arrays are invalid' using errcode = '22023';
    end if;
    if jsonb_array_length(knowledge_items) > 60
       or jsonb_array_length(prompt_items) > 60
    then
        raise exception 'refresh bundle is too large' using errcode = '22023';
    end if;
    if jsonb_array_length(knowledge_items) = 0
       and jsonb_array_length(prompt_items) = 0
    then
        raise exception 'refresh bundle contains no updates' using errcode = '22023';
    end if;

    select *
    into request_row
    from public.knowledge_refresh_requests as request
    where request.id = p_request_id
    for update;

    if not found then
        raise exception 'refresh request not found' using errcode = 'P0002';
    end if;
    if request_row.status not in ('pending', 'processing') then
        raise exception 'refresh request is not publishable' using errcode = '22023';
    end if;

    select *
    into channel_row
    from public.knowledge_refresh_channels as refresh_channel
    where refresh_channel.channel = request_row.channel
    for update;

    if not found then
        raise exception 'knowledge refresh channel not found' using errcode = 'P0002';
    end if;

    select settings.stable_knowledge_refresh_hours
    into stable_delay_hours
    from public.creator_system_settings as settings
    where settings.id = 1;

    stable_delay_hours := greatest(coalesce(stable_delay_hours, 168), 1);
    next_version := channel_row.current_version + 1;
    release_value := case when request_row.channel = 'fresh' then 'fresh_first' else 'both' end;
    stable_at := case
        when request_row.channel = 'fresh' then now() + make_interval(hours => stable_delay_hours)
        else now()
    end;

    update public.knowledge_refresh_requests
    set
        status = 'processing',
        started_at = coalesce(started_at, now()),
        error_message = null
    where id = p_request_id;

    for item in
        select value from jsonb_array_elements(knowledge_items)
    loop
        if jsonb_typeof(item) <> 'object' then
            raise exception 'knowledge rule must be an object' using errcode = '22023';
        end if;

        clean_key := left(trim(coalesce(item ->> 'key', '')), 180);
        clean_kind := lower(trim(coalesce(item ->> 'kind', '')));
        clean_label := left(trim(coalesce(item ->> 'label', '')), 120);
        clean_parent := left(trim(coalesce(item ->> 'parent_label', '')), 120);
        clean_summary := left(trim(coalesce(item ->> 'source_summary', '')), 1000);
        priority_value := greatest(0, least(100, coalesce(nullif(item ->> 'priority', '')::integer, 70)));

        if clean_key = '' or clean_key not like 'auto:%' then
            raise exception 'knowledge key must start with auto:' using errcode = '22023';
        end if;
        if clean_kind not in ('age', 'genre', 'subgenre', 'publication', 'task', 'combination') then
            raise exception 'invalid knowledge kind' using errcode = '22023';
        end if;
        if clean_label = '' then
            raise exception 'knowledge label is required' using errcode = '22023';
        end if;

        aliases_value := private.aas_json_text_array(item -> 'aliases', 40, 120);
        guidance_value := private.aas_json_text_array(item -> 'guidance', 40, 600);
        deliverables_value := private.aas_json_text_array(item -> 'deliverables', 40, 300);
        cautions_value := private.aas_json_text_array(item -> 'cautions', 40, 600);
        tasks_value := private.aas_json_text_array(item -> 'tasks', 5, 32);
        source_urls_value := private.aas_json_text_array(item -> 'source_urls', 20, 500);

        if not (tasks_value <@ array['title','article','image','social','promotion']::text[]) then
            raise exception 'invalid knowledge task list' using errcode = '22023';
        end if;
        if cardinality(source_urls_value) < 1 then
            raise exception 'knowledge source_urls are required' using errcode = '22023';
        end if;

        insert into public.knowledge_catalog (
            key, kind, label, parent_label, aliases, guidance, deliverables, cautions,
            tasks, priority, status, source, created_by, release_channel,
            stable_available_at, source_urls, source_summary, source_checked_at,
            catalog_version, updated_at
        ) values (
            clean_key, clean_kind, clean_label, nullif(clean_parent, ''), aliases_value,
            guidance_value, deliverables_value, cautions_value, tasks_value,
            priority_value, 'active', 'admin', admin_id, release_value,
            stable_at, source_urls_value, nullif(clean_summary, ''), now(),
            next_version, now()
        )
        on conflict (key) do update set
            kind = excluded.kind,
            label = excluded.label,
            parent_label = excluded.parent_label,
            aliases = excluded.aliases,
            guidance = excluded.guidance,
            deliverables = excluded.deliverables,
            cautions = excluded.cautions,
            tasks = excluded.tasks,
            priority = excluded.priority,
            status = 'active',
            source = 'admin',
            release_channel = excluded.release_channel,
            stable_available_at = excluded.stable_available_at,
            source_urls = excluded.source_urls,
            source_summary = excluded.source_summary,
            source_checked_at = excluded.source_checked_at,
            catalog_version = excluded.catalog_version,
            updated_at = now();

        knowledge_count_value := knowledge_count_value + 1;
    end loop;

    for item in
        select value from jsonb_array_elements(prompt_items)
    loop
        if jsonb_typeof(item) <> 'object' then
            raise exception 'prompt optimization must be an object' using errcode = '22023';
        end if;

        clean_key := left(trim(coalesce(item ->> 'key', '')), 180);
        clean_provider := lower(trim(coalesce(item ->> 'provider', 'all')));
        clean_plan := lower(trim(coalesce(item ->> 'plan', 'all')));
        clean_task := lower(trim(coalesce(item ->> 'task', 'all')));
        clean_summary := left(trim(coalesce(item ->> 'source_summary', '')), 1000);
        priority_value := greatest(0, least(100, coalesce(nullif(item ->> 'priority', '')::integer, 70)));
        rules_value := private.aas_json_text_array(item -> 'rules', 40, 600);
        source_urls_value := private.aas_json_text_array(item -> 'source_urls', 20, 500);

        if clean_key = '' or clean_key not like 'auto:%' then
            raise exception 'prompt key must start with auto:' using errcode = '22023';
        end if;
        if clean_provider not in ('all', 'chatgpt', 'claude', 'gemini') then
            raise exception 'invalid prompt provider' using errcode = '22023';
        end if;
        if clean_plan not in ('all', 'free', 'paid') then
            raise exception 'invalid prompt plan' using errcode = '22023';
        end if;
        if clean_task not in ('all', 'title', 'article', 'image', 'social', 'promotion') then
            raise exception 'invalid prompt task' using errcode = '22023';
        end if;
        if cardinality(rules_value) < 1 then
            raise exception 'prompt rules are required' using errcode = '22023';
        end if;
        if cardinality(source_urls_value) < 1 then
            raise exception 'prompt source_urls are required' using errcode = '22023';
        end if;

        insert into public.prompt_optimization_catalog (
            key, provider, plan, task, rules, source_urls, source_summary,
            priority, release_channel, stable_available_at, catalog_version,
            status, created_by, source_checked_at, updated_at
        ) values (
            clean_key, clean_provider, clean_plan, clean_task, rules_value,
            source_urls_value, nullif(clean_summary, ''), priority_value,
            release_value, stable_at, next_version, 'active', admin_id, now(), now()
        )
        on conflict (key) do update set
            provider = excluded.provider,
            plan = excluded.plan,
            task = excluded.task,
            rules = excluded.rules,
            source_urls = excluded.source_urls,
            source_summary = excluded.source_summary,
            priority = excluded.priority,
            release_channel = excluded.release_channel,
            stable_available_at = excluded.stable_available_at,
            catalog_version = excluded.catalog_version,
            status = 'active',
            source_checked_at = excluded.source_checked_at,
            updated_at = now();

        prompt_count_value := prompt_count_value + 1;
    end loop;

    clean_summary := left(trim(coalesce(bundle ->> 'summary', '')), 2000);

    update public.knowledge_refresh_channels as refresh_channel
    set
        current_version = next_version,
        last_published_at = now(),
        next_refresh_due_at = now() + make_interval(hours => refresh_channel.refresh_hours),
        updated_at = now()
    where refresh_channel.channel = request_row.channel;

    update public.knowledge_refresh_requests as request
    set
        status = 'completed',
        completed_at = now(),
        research_summary = nullif(clean_summary, ''),
        published_knowledge_count = knowledge_count_value,
        published_prompt_count = prompt_count_value,
        published_version = next_version,
        error_message = null
    where request.id = p_request_id;

    return query
    select request_row.channel, next_version, knowledge_count_value, prompt_count_value;
end;
$function$;

revoke all on function public.list_my_active_knowledge_catalog_v2() from public, anon;
revoke all on function public.list_my_active_prompt_optimizations() from public, anon;
revoke all on function public.get_my_knowledge_runtime_state() from public, anon;
revoke all on function public.admin_list_knowledge_refresh_requests(text, integer) from public, anon;
revoke all on function public.admin_request_knowledge_refresh(text) from public, anon;
revoke all on function public.admin_start_knowledge_refresh(bigint) from public, anon;
revoke all on function public.admin_fail_knowledge_refresh(bigint, text) from public, anon;
revoke all on function public.admin_publish_knowledge_refresh_bundle(bigint, jsonb) from public, anon;

grant execute on function public.list_my_active_knowledge_catalog_v2() to authenticated;
grant execute on function public.list_my_active_prompt_optimizations() to authenticated;
grant execute on function public.get_my_knowledge_runtime_state() to authenticated;
grant execute on function public.admin_list_knowledge_refresh_requests(text, integer) to authenticated;
grant execute on function public.admin_request_knowledge_refresh(text) to authenticated;
grant execute on function public.admin_start_knowledge_refresh(bigint) to authenticated;
grant execute on function public.admin_fail_knowledge_refresh(bigint, text) to authenticated;
grant execute on function public.admin_publish_knowledge_refresh_bundle(bigint, jsonb) to authenticated;
