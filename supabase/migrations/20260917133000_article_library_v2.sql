begin;

create table if not exists public.article_library_meta (
    article_id uuid primary key references public.articles(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    magazine_enabled boolean not null default false,
    magazine_name text,
    series_name text,
    series_order integer,
    magazine_role text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint article_library_meta_magazine_name_check check (magazine_name is null or length(trim(magazine_name)) between 1 and 200),
    constraint article_library_meta_series_name_check check (series_name is null or length(trim(series_name)) between 1 and 200),
    constraint article_library_meta_series_order_check check (series_order is null or series_order between 1 and 9999),
    constraint article_library_meta_role_check check (magazine_role is null or magazine_role in ('intro','standard','summary','bonus')),
    constraint article_library_meta_disabled_clear_check check (
        magazine_enabled or (magazine_name is null and series_name is null and series_order is null and magazine_role is null)
    )
);

create index if not exists article_library_meta_user_magazine_idx
    on public.article_library_meta (user_id, magazine_enabled, magazine_name, series_order, article_id);

alter table public.article_library_meta enable row level security;
alter table public.article_library_meta force row level security;
revoke all on table public.article_library_meta from public, anon, authenticated;
grant select on table public.article_library_meta to authenticated;

drop policy if exists article_library_meta_select_own on public.article_library_meta;
create policy article_library_meta_select_own
on public.article_library_meta
for select
to authenticated
using (
    user_id = (select auth.uid())
    and (
        (select public.can_access_product('AAS-WIN-BETA'))
        or (select public.can_access_product('AAS-PWA-BETA'))
    )
);

create or replace function public.get_article_library_meta(p_article_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    result jsonb;
begin
    if current_user_id is null or not (
        (select public.can_access_product('AAS-WIN-BETA'))
        or (select public.can_access_product('AAS-PWA-BETA'))
    ) then
        raise exception 'cloud article entitlement required' using errcode = '42501';
    end if;

    if not exists (
        select 1 from public.articles a
        where a.id = p_article_id and a.user_id = current_user_id
    ) then
        raise exception 'article not found' using errcode = 'P0002';
    end if;

    select jsonb_build_object(
        'article_id', p_article_id,
        'magazine_enabled', coalesce(m.magazine_enabled, false),
        'magazine_name', m.magazine_name,
        'series_name', m.series_name,
        'series_order', m.series_order,
        'magazine_role', m.magazine_role
    ) into result
    from (select 1) seed
    left join public.article_library_meta m
      on m.article_id = p_article_id and m.user_id = current_user_id;

    return result;
end;
$function$;

revoke all on function public.get_article_library_meta(uuid) from public, anon;
grant execute on function public.get_article_library_meta(uuid) to authenticated;

create or replace function public.update_article_library_meta(
    p_article_id uuid,
    p_expected_revision integer,
    p_meta jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    meta jsonb := coalesce(p_meta, '{}'::jsonb);
    current_article public.articles%rowtype;
    enabled boolean;
    name_value text;
    series_value text;
    order_value integer;
    role_value text;
    next_revision integer;
begin
    if current_user_id is null or not (
        (select public.can_access_product('AAS-WIN-BETA'))
        or (select public.can_access_product('AAS-PWA-BETA'))
    ) then
        raise exception 'cloud article entitlement required' using errcode = '42501';
    end if;
    if p_expected_revision is null or p_expected_revision < 1 then
        raise exception 'expected revision required' using errcode = '22023';
    end if;
    if jsonb_typeof(meta) <> 'object' then
        raise exception 'meta must be an object' using errcode = '22023';
    end if;
    if exists (
        select 1 from jsonb_object_keys(meta) k
        where k not in ('magazine_enabled','magazine_name','series_name','series_order','magazine_role')
    ) then
        raise exception 'unsupported library meta field' using errcode = '22023';
    end if;

    select * into current_article
    from public.articles a
    where a.id = p_article_id and a.user_id = current_user_id
    for update;
    if not found then raise exception 'article not found' using errcode = 'P0002'; end if;
    if current_article.revision <> p_expected_revision then
        raise exception 'article revision conflict' using errcode = '40001';
    end if;

    enabled := coalesce((meta ->> 'magazine_enabled')::boolean, false);
    if enabled and current_article.publication_target <> 'note' then
        raise exception 'magazine settings require note article' using errcode = '22023';
    end if;

    if enabled then
        name_value := nullif(trim(meta ->> 'magazine_name'), '');
        series_value := nullif(trim(meta ->> 'series_name'), '');
        order_value := case when nullif(trim(meta ->> 'series_order'), '') is null then null else (meta ->> 'series_order')::integer end;
        role_value := nullif(trim(meta ->> 'magazine_role'), '');
        if name_value is null then raise exception 'magazine name required' using errcode = '22023'; end if;
    else
        name_value := null; series_value := null; order_value := null; role_value := null;
    end if;

    insert into public.article_library_meta (
        article_id,user_id,magazine_enabled,magazine_name,series_name,series_order,magazine_role,updated_at
    ) values (
        p_article_id,current_user_id,enabled,name_value,series_value,order_value,role_value,now()
    )
    on conflict (article_id) do update set
        magazine_enabled = excluded.magazine_enabled,
        magazine_name = excluded.magazine_name,
        series_name = excluded.series_name,
        series_order = excluded.series_order,
        magazine_role = excluded.magazine_role,
        updated_at = now()
    where public.article_library_meta.user_id = current_user_id;

    -- Keep the article revision as the single optimistic-lock version for PWA/Windows.
    update public.articles a set title = a.title
    where a.id = p_article_id and a.user_id = current_user_id and a.revision = p_expected_revision
    returning a.revision into next_revision;
    if next_revision is null then raise exception 'article revision conflict' using errcode = '40001'; end if;

    return jsonb_build_object(
        'article_id', p_article_id,
        'revision', next_revision,
        'magazine_enabled', enabled,
        'magazine_name', name_value,
        'series_name', series_value,
        'series_order', order_value,
        'magazine_role', role_value
    );
end;
$function$;

revoke all on function public.update_article_library_meta(uuid, integer, jsonb) from public, anon;
grant execute on function public.update_article_library_meta(uuid, integer, jsonb) to authenticated;

create or replace function public.list_article_library_page(
    p_page integer default 1,
    p_page_size integer default 30,
    p_query text default null,
    p_status text default null,
    p_publication_target text default null,
    p_genre text default null,
    p_subgenre text default null,
    p_magazine_only boolean default false,
    p_magazine_name text default null,
    p_sort text default 'updated_desc'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    safe_page integer := greatest(coalesce(p_page,1),1);
    safe_size integer := least(greatest(coalesce(p_page_size,30),1),50);
    offset_count integer;
    total_count bigint;
    rows_json jsonb;
    needle text := nullif(trim(coalesce(p_query,'')), '');
    status_value text := nullif(trim(coalesce(p_status,'')), '');
    target_value text := nullif(trim(coalesce(p_publication_target,'')), '');
    genre_value text := nullif(trim(coalesce(p_genre,'')), '');
    subgenre_value text := nullif(trim(coalesce(p_subgenre,'')), '');
    magazine_value text := nullif(trim(coalesce(p_magazine_name,'')), '');
    sort_value text := coalesce(nullif(trim(p_sort),''),'updated_desc');
begin
    if current_user_id is null or not (
        (select public.can_access_product('AAS-WIN-BETA'))
        or (select public.can_access_product('AAS-PWA-BETA'))
    ) then
        raise exception 'cloud article entitlement required' using errcode = '42501';
    end if;
    if status_value is not null and status_value not in ('draft','writing','ready','waiting_publish','published','on_hold','archived') then
        raise exception 'invalid status filter' using errcode = '22023';
    end if;
    if sort_value not in ('updated_desc','updated_asc','created_desc','created_asc','title_asc','series_order') then
        raise exception 'invalid sort' using errcode = '22023';
    end if;
    offset_count := (safe_page - 1) * safe_size;

    select count(*) into total_count
    from public.articles a
    left join public.article_library_meta m on m.article_id = a.id and m.user_id = a.user_id
    where a.user_id = current_user_id
      and (status_value is null or a.status = status_value)
      and (target_value is null or a.publication_target = target_value)
      and (genre_value is null or a.genre = genre_value)
      and (subgenre_value is null or a.subgenre = subgenre_value)
      and (not coalesce(p_magazine_only,false) or coalesce(m.magazine_enabled,false))
      and (magazine_value is null or (coalesce(m.magazine_enabled,false) and m.magazine_name = magazine_value))
      and (
        needle is null or
        a.title ilike '%' || needle || '%' or
        coalesce(a.genre,'') ilike '%' || needle || '%' or
        coalesce(a.subgenre,'') ilike '%' || needle || '%' or
        coalesce(m.magazine_name,'') ilike '%' || needle || '%' or
        coalesce(m.series_name,'') ilike '%' || needle || '%' or
        array_to_string(a.tags,' ') ilike '%' || needle || '%'
      );

    select coalesce(jsonb_agg(to_jsonb(page_row)), '[]'::jsonb)
    into rows_json
    from (
        select
            a.id, a.user_id, a.title, a.publication_target, a.article_type,
            a.genre, a.subgenre, a.status, a.price, a.tags, a.revision,
            a.created_at, a.updated_at,
            coalesce(m.magazine_enabled,false) as magazine_enabled,
            m.magazine_name, m.series_name, m.series_order, m.magazine_role
        from public.articles a
        left join public.article_library_meta m on m.article_id = a.id and m.user_id = a.user_id
        where a.user_id = current_user_id
          and (status_value is null or a.status = status_value)
          and (target_value is null or a.publication_target = target_value)
          and (genre_value is null or a.genre = genre_value)
          and (subgenre_value is null or a.subgenre = subgenre_value)
          and (not coalesce(p_magazine_only,false) or coalesce(m.magazine_enabled,false))
          and (magazine_value is null or (coalesce(m.magazine_enabled,false) and m.magazine_name = magazine_value))
          and (
            needle is null or
            a.title ilike '%' || needle || '%' or
            coalesce(a.genre,'') ilike '%' || needle || '%' or
            coalesce(a.subgenre,'') ilike '%' || needle || '%' or
            coalesce(m.magazine_name,'') ilike '%' || needle || '%' or
            coalesce(m.series_name,'') ilike '%' || needle || '%' or
            array_to_string(a.tags,' ') ilike '%' || needle || '%'
          )
        order by
          case when sort_value = 'updated_desc' then a.updated_at end desc,
          case when sort_value = 'updated_asc' then a.updated_at end asc,
          case when sort_value = 'created_desc' then a.created_at end desc,
          case when sort_value = 'created_asc' then a.created_at end asc,
          case when sort_value = 'title_asc' then lower(a.title) end asc,
          case when sort_value = 'series_order' then m.series_order end asc nulls last,
          a.updated_at desc,
          a.id
        limit safe_size offset offset_count
    ) page_row;

    return jsonb_build_object(
        'rows', rows_json,
        'total', total_count,
        'page', safe_page,
        'page_size', safe_size,
        'has_next', offset_count + safe_size < total_count
    );
end;
$function$;

revoke all on function public.list_article_library_page(integer, integer, text, text, text, text, text, boolean, text, text) from public, anon;
grant execute on function public.list_article_library_page(integer, integer, text, text, text, text, text, boolean, text, text) to authenticated;

create or replace function public.duplicate_cloud_article(
    p_article_id uuid,
    p_expected_revision integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    source_article public.articles%rowtype;
    new_id uuid;
    source_meta public.article_library_meta%rowtype;
begin
    if current_user_id is null or not (
        (select public.can_access_product('AAS-WIN-BETA'))
        or (select public.can_access_product('AAS-PWA-BETA'))
    ) then
        raise exception 'cloud article entitlement required' using errcode = '42501';
    end if;

    select * into source_article from public.articles a
    where a.id = p_article_id and a.user_id = current_user_id;
    if not found then raise exception 'article not found' using errcode = 'P0002'; end if;
    if source_article.revision <> p_expected_revision then raise exception 'article revision conflict' using errcode = '40001'; end if;

    insert into public.articles (
        user_id,title,publication_target,article_type,genre,subgenre,body,status,price,tags
    ) values (
        current_user_id,left(source_article.title || '（コピー）',500),source_article.publication_target,
        source_article.article_type,source_article.genre,source_article.subgenre,source_article.body,
        'draft',source_article.price,source_article.tags
    ) returning id into new_id;

    insert into public.article_workspaces (
        article_id,user_id,request_json,workspace_json,image_plan_json,source_body,publish_body
    )
    select new_id,current_user_id,w.request_json,w.workspace_json,w.image_plan_json,w.source_body,w.publish_body
    from public.article_workspaces w
    where w.article_id = p_article_id and w.user_id = current_user_id;

    select * into source_meta from public.article_library_meta m
    where m.article_id = p_article_id and m.user_id = current_user_id;
    if found then
        insert into public.article_library_meta (
            article_id,user_id,magazine_enabled,magazine_name,series_name,series_order,magazine_role
        ) values (
            new_id,current_user_id,source_meta.magazine_enabled,source_meta.magazine_name,
            source_meta.series_name,source_meta.series_order,source_meta.magazine_role
        );
    end if;

    return new_id;
end;
$function$;

revoke all on function public.duplicate_cloud_article(uuid, integer) from public, anon;
grant execute on function public.duplicate_cloud_article(uuid, integer) to authenticated;

commit;
