-- Knowledge / Prompt update diff visibility.
-- Remote migration: 20260919122008 knowledge_prompt_update_diff_visibility

alter table public.knowledge_refresh_requests
  add column if not exists change_details jsonb not null default jsonb_build_object(
    'knowledge', jsonb_build_object('added',0,'updated',0,'unchanged',0,'items','[]'::jsonb),
    'prompt', jsonb_build_object('added',0,'updated',0,'unchanged',0,'items','[]'::jsonb)
  );

alter table public.knowledge_refresh_requests
  drop constraint if exists knowledge_refresh_requests_change_details_check;

alter table public.knowledge_refresh_requests
  add constraint knowledge_refresh_requests_change_details_check
  check (jsonb_typeof(change_details) = 'object' and pg_column_size(change_details) <= 131072);

create or replace function private.aas_knowledge_refresh_diff(p_bundle jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  bundle jsonb := coalesce(p_bundle, '{}'::jsonb);
  knowledge_items jsonb := coalesce(bundle -> 'knowledge_rules', '[]'::jsonb);
  prompt_items jsonb := coalesce(bundle -> 'prompt_optimizations', '[]'::jsonb);
  item jsonb;
  k public.knowledge_catalog%rowtype;
  p public.prompt_optimization_catalog%rowtype;
  knowledge_list jsonb := '[]'::jsonb;
  prompt_list jsonb := '[]'::jsonb;
  changed jsonb;
  action_value text;
  clean_key text;
  clean_kind text;
  clean_label text;
  clean_parent text;
  clean_provider text;
  clean_plan text;
  clean_task text;
  clean_summary text;
  priority_value integer;
  aliases_value text[];
  guidance_value text[];
  deliverables_value text[];
  cautions_value text[];
  tasks_value text[];
  rules_value text[];
  source_urls_value text[];
  k_added integer := 0;
  k_updated integer := 0;
  k_unchanged integer := 0;
  p_added integer := 0;
  p_updated integer := 0;
  p_unchanged integer := 0;
begin
  if jsonb_typeof(bundle) <> 'object'
     or jsonb_typeof(knowledge_items) <> 'array'
     or jsonb_typeof(prompt_items) <> 'array'
  then
    raise exception 'refresh bundle is invalid' using errcode = '22023';
  end if;

  if jsonb_array_length(knowledge_items) > 60 or jsonb_array_length(prompt_items) > 60 then
    raise exception 'refresh bundle is too large' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(knowledge_items)
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
    aliases_value := private.aas_json_text_array(item -> 'aliases', 40, 120);
    guidance_value := private.aas_json_text_array(item -> 'guidance', 40, 600);
    deliverables_value := private.aas_json_text_array(item -> 'deliverables', 40, 300);
    cautions_value := private.aas_json_text_array(item -> 'cautions', 40, 600);
    tasks_value := private.aas_json_text_array(item -> 'tasks', 5, 32);
    source_urls_value := private.aas_json_text_array(item -> 'source_urls', 20, 500);

    if clean_key = '' or clean_key not like 'auto:%' then
      raise exception 'knowledge key must start with auto:' using errcode = '22023';
    end if;

    changed := '[]'::jsonb;
    select * into k from public.knowledge_catalog where key = clean_key;

    if not found then
      action_value := 'added';
      k_added := k_added + 1;
      changed := '["new"]'::jsonb;
    else
      if k.kind is distinct from clean_kind then changed := changed || '"kind"'::jsonb; end if;
      if k.label is distinct from clean_label then changed := changed || '"label"'::jsonb; end if;
      if k.parent_label is distinct from nullif(clean_parent, '') then changed := changed || '"parent_label"'::jsonb; end if;
      if coalesce(k.aliases, '{}'::text[]) is distinct from aliases_value then changed := changed || '"aliases"'::jsonb; end if;
      if coalesce(k.guidance, '{}'::text[]) is distinct from guidance_value then changed := changed || '"guidance"'::jsonb; end if;
      if coalesce(k.deliverables, '{}'::text[]) is distinct from deliverables_value then changed := changed || '"deliverables"'::jsonb; end if;
      if coalesce(k.cautions, '{}'::text[]) is distinct from cautions_value then changed := changed || '"cautions"'::jsonb; end if;
      if coalesce(k.tasks, '{}'::text[]) is distinct from tasks_value then changed := changed || '"tasks"'::jsonb; end if;
      if k.priority is distinct from priority_value then changed := changed || '"priority"'::jsonb; end if;
      if coalesce(k.source_urls, '{}'::text[]) is distinct from source_urls_value then changed := changed || '"sources"'::jsonb; end if;
      if coalesce(k.source_summary, '') is distinct from clean_summary then changed := changed || '"source_summary"'::jsonb; end if;

      if jsonb_array_length(changed) = 0 then
        action_value := 'unchanged';
        k_unchanged := k_unchanged + 1;
      else
        action_value := 'updated';
        k_updated := k_updated + 1;
      end if;
    end if;

    knowledge_list := knowledge_list || jsonb_build_array(jsonb_build_object(
      'item_type', 'knowledge', 'key', clean_key, 'label', clean_label,
      'action', action_value, 'changed_fields', changed, 'source_summary', clean_summary
    ));
  end loop;

  for item in select value from jsonb_array_elements(prompt_items)
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

    changed := '[]'::jsonb;
    select * into p from public.prompt_optimization_catalog where key = clean_key;

    if not found then
      action_value := 'added';
      p_added := p_added + 1;
      changed := '["new"]'::jsonb;
    else
      if p.provider is distinct from clean_provider then changed := changed || '"provider"'::jsonb; end if;
      if p.plan is distinct from clean_plan then changed := changed || '"plan"'::jsonb; end if;
      if p.task is distinct from clean_task then changed := changed || '"task"'::jsonb; end if;
      if coalesce(p.rules, '{}'::text[]) is distinct from rules_value then changed := changed || '"rules"'::jsonb; end if;
      if p.priority is distinct from priority_value then changed := changed || '"priority"'::jsonb; end if;
      if coalesce(p.source_urls, '{}'::text[]) is distinct from source_urls_value then changed := changed || '"sources"'::jsonb; end if;
      if coalesce(p.source_summary, '') is distinct from clean_summary then changed := changed || '"source_summary"'::jsonb; end if;

      if jsonb_array_length(changed) = 0 then
        action_value := 'unchanged';
        p_unchanged := p_unchanged + 1;
      else
        action_value := 'updated';
        p_updated := p_updated + 1;
      end if;
    end if;

    prompt_list := prompt_list || jsonb_build_array(jsonb_build_object(
      'item_type', 'prompt', 'key', clean_key, 'label', clean_provider || ' / ' || clean_task,
      'action', action_value, 'changed_fields', changed, 'source_summary', clean_summary
    ));
  end loop;

  return jsonb_build_object(
    'knowledge', jsonb_build_object('added', k_added, 'updated', k_updated, 'unchanged', k_unchanged, 'items', knowledge_list),
    'prompt', jsonb_build_object('added', p_added, 'updated', p_updated, 'unchanged', p_unchanged, 'items', prompt_list)
  );
end;
$function$;

revoke all on function private.aas_knowledge_refresh_diff(jsonb) from public, anon, authenticated;

create or replace function public.admin_preview_knowledge_refresh_bundle_diff(p_bundle jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null or not (select private.is_active_admin()) then
    raise exception 'active admin required' using errcode = '42501';
  end if;
  return private.aas_knowledge_refresh_diff(p_bundle);
end;
$function$;

create or replace function public.admin_publish_knowledge_refresh_bundle_v2(p_request_id bigint,p_bundle jsonb)
returns table (channel text,published_version bigint,knowledge_count integer,prompt_count integer,change_details jsonb)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  diff jsonb;
  result_row record;
begin
  if (select auth.uid()) is null or not (select private.is_active_admin()) then
    raise exception 'active admin required' using errcode = '42501';
  end if;

  diff := private.aas_knowledge_refresh_diff(p_bundle);
  select * into result_row from public.admin_publish_knowledge_refresh_bundle(p_request_id, p_bundle);

  update public.knowledge_refresh_requests set change_details = diff where id = p_request_id;

  return query
  select result_row.channel::text,result_row.published_version::bigint,
         result_row.knowledge_count::integer,result_row.prompt_count::integer,diff;
end;
$function$;

create or replace function public.admin_list_knowledge_refresh_requests_v2(p_status text default null,p_limit integer default 50)
returns table (
  id bigint,channel text,requested_at timestamptz,started_at timestamptz,status text,
  completed_at timestamptz,research_summary text,published_knowledge_count integer,
  published_prompt_count integer,published_version bigint,error_message text,change_details jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null or not (select private.is_active_admin()) then
    raise exception 'active admin required' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('pending','processing','completed','failed','cancelled') then
    raise exception 'invalid refresh status' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    raise exception 'invalid refresh limit' using errcode = '22023';
  end if;

  return query
  select request.id,request.channel,request.requested_at,request.started_at,request.status,
         request.completed_at,request.research_summary,request.published_knowledge_count,
         request.published_prompt_count,request.published_version,request.error_message,
         request.change_details
  from public.knowledge_refresh_requests request
  where p_status is null or request.status = p_status
  order by case request.status when 'processing' then 1 when 'pending' then 2 when 'failed' then 3 else 4 end,
           request.requested_at desc
  limit p_limit;
end;
$function$;

create or replace function public.admin_get_knowledge_refresh_channels()
returns table (
  channel text,refresh_hours integer,current_version bigint,last_published_at timestamptz,
  next_refresh_due_at timestamptz,last_refresh_requested_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null or not (select private.is_active_admin()) then
    raise exception 'active admin required' using errcode = '42501';
  end if;

  return query
  select c.channel,c.refresh_hours,c.current_version,c.last_published_at,c.next_refresh_due_at,c.last_refresh_requested_at
  from public.knowledge_refresh_channels c
  order by case c.channel when 'fresh' then 1 else 2 end;
end;
$function$;

revoke all on function public.admin_preview_knowledge_refresh_bundle_diff(jsonb) from public, anon;
revoke all on function public.admin_publish_knowledge_refresh_bundle_v2(bigint, jsonb) from public, anon;
revoke all on function public.admin_list_knowledge_refresh_requests_v2(text, integer) from public, anon;
revoke all on function public.admin_get_knowledge_refresh_channels() from public, anon;

grant execute on function public.admin_preview_knowledge_refresh_bundle_diff(jsonb) to authenticated;
grant execute on function public.admin_publish_knowledge_refresh_bundle_v2(bigint, jsonb) to authenticated;
grant execute on function public.admin_list_knowledge_refresh_requests_v2(text, integer) to authenticated;
grant execute on function public.admin_get_knowledge_refresh_channels() to authenticated;
