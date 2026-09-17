-- Article Library 2.0: paged metadata-only listing with note magazine metadata.
-- Magazine metadata remains in article_workspaces.workspace_json so frozen Windows
-- article columns and RPC payloads stay compatible.

begin;

create index if not exists articles_user_genre_updated_idx
    on public.articles (user_id, genre, subgenre, updated_at desc, id);

create index if not exists article_workspaces_note_magazine_name_idx
    on public.article_workspaces ((workspace_json #>> '{pwa_note_magazine,name}'))
    where workspace_json ? 'pwa_note_magazine';

create or replace function public.list_article_library_v2(
    p_limit integer default 50,
    p_offset integer default 0,
    p_query text default null,
    p_status text default null,
    p_publication_target text default null,
    p_article_type text default null,
    p_genre text default null,
    p_subgenre text default null,
    p_magazine_name text default null,
    p_sort text default 'updated_desc'
)
returns table (
    id uuid,
    user_id uuid,
    title text,
    publication_target text,
    article_type text,
    genre text,
    subgenre text,
    status text,
    price bigint,
    tags text[],
    revision integer,
    created_at timestamptz,
    updated_at timestamptz,
    magazine_enabled boolean,
    magazine_name text,
    magazine_type text,
    series_name text,
    series_order integer,
    magazine_role text,
    total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    query_text text := nullif(trim(p_query), '');
    status_filter text := nullif(trim(p_status), '');
    publication_filter text := nullif(trim(p_publication_target), '');
    type_filter text := nullif(trim(p_article_type), '');
    genre_filter text := nullif(trim(p_genre), '');
    subgenre_filter text := nullif(trim(p_subgenre), '');
    magazine_filter text := nullif(trim(p_magazine_name), '');
    sort_value text := coalesce(nullif(trim(p_sort), ''), 'updated_desc');
begin
    if current_user_id is null
       or not (select private.is_active_profile())
       or not (select public.can_access_product('AAS-PWA-BETA'))
    then
        raise exception 'active PWA access required' using errcode = '42501';
    end if;

    if p_limit is null or p_limit < 1 or p_limit > 100 then
        raise exception 'invalid page size' using errcode = '22023';
    end if;
    if p_offset is null or p_offset < 0 or p_offset > 10000 then
        raise exception 'invalid page offset' using errcode = '22023';
    end if;
    if status_filter is not null and status_filter not in (
        'draft','writing','ready','waiting_publish','published','on_hold','archived'
    ) then
        raise exception 'invalid status filter' using errcode = '22023';
    end if;
    if type_filter is not null and type_filter not in ('free','paid') then
        raise exception 'invalid article type filter' using errcode = '22023';
    end if;
    if sort_value not in (
        'updated_desc','updated_asc','created_desc','created_asc','title_asc',
        'status_asc','genre_asc','subgenre_asc','magazine_asc'
    ) then
        raise exception 'invalid sort' using errcode = '22023';
    end if;

    return query
    with library_rows as (
        select
            article.id,
            article.user_id,
            article.title,
            article.publication_target,
            article.article_type,
            article.genre,
            article.subgenre,
            article.status,
            article.price,
            article.tags,
            article.revision,
            article.created_at,
            article.updated_at,
            coalesce(workspace.workspace_json #>> '{pwa_note_magazine,enabled}', 'false') = 'true' as magazine_enabled,
            nullif(trim(workspace.workspace_json #>> '{pwa_note_magazine,name}'), '') as magazine_name,
            nullif(trim(workspace.workspace_json #>> '{pwa_note_magazine,type}'), '') as magazine_type,
            nullif(trim(workspace.workspace_json #>> '{pwa_note_magazine,series_name}'), '') as series_name,
            case
                when coalesce(workspace.workspace_json #>> '{pwa_note_magazine,order}', '') ~ '^[0-9]{1,4}$'
                then (workspace.workspace_json #>> '{pwa_note_magazine,order}')::integer
                else null
            end as series_order,
            nullif(trim(workspace.workspace_json #>> '{pwa_note_magazine,role}'), '') as magazine_role
        from public.articles as article
        left join public.article_workspaces as workspace
          on workspace.article_id = article.id
         and workspace.user_id = article.user_id
        where article.user_id = current_user_id
    ), filtered as (
        select library_rows.*
        from library_rows
        where (status_filter is null or library_rows.status = status_filter)
          and (publication_filter is null or library_rows.publication_target = publication_filter)
          and (type_filter is null or library_rows.article_type = type_filter)
          and (genre_filter is null or lower(coalesce(library_rows.genre, '')) = lower(genre_filter))
          and (subgenre_filter is null or lower(coalesce(library_rows.subgenre, '')) = lower(subgenre_filter))
          and (magazine_filter is null or lower(coalesce(library_rows.magazine_name, '')) = lower(magazine_filter))
          and (
              query_text is null
              or library_rows.title ilike '%' || query_text || '%'
              or coalesce(library_rows.genre, '') ilike '%' || query_text || '%'
              or coalesce(library_rows.subgenre, '') ilike '%' || query_text || '%'
              or coalesce(library_rows.magazine_name, '') ilike '%' || query_text || '%'
              or coalesce(library_rows.series_name, '') ilike '%' || query_text || '%'
              or array_to_string(library_rows.tags, ' ') ilike '%' || query_text || '%'
          )
    )
    select
        filtered.id,
        filtered.user_id,
        filtered.title,
        filtered.publication_target,
        filtered.article_type,
        filtered.genre,
        filtered.subgenre,
        filtered.status,
        filtered.price,
        filtered.tags,
        filtered.revision,
        filtered.created_at,
        filtered.updated_at,
        filtered.magazine_enabled,
        filtered.magazine_name,
        filtered.magazine_type,
        filtered.series_name,
        filtered.series_order,
        filtered.magazine_role,
        count(*) over() as total_count
    from filtered
    order by
        case when sort_value = 'updated_desc' then filtered.updated_at end desc,
        case when sort_value = 'updated_asc' then filtered.updated_at end asc,
        case when sort_value = 'created_desc' then filtered.created_at end desc,
        case when sort_value = 'created_asc' then filtered.created_at end asc,
        case when sort_value = 'title_asc' then lower(filtered.title) end asc,
        case when sort_value = 'status_asc' then
            case filtered.status
                when 'draft' then 1 when 'writing' then 2 when 'ready' then 3
                when 'waiting_publish' then 4 when 'published' then 5
                when 'on_hold' then 6 when 'archived' then 7 else 99
            end
        end asc,
        case when sort_value = 'genre_asc' then lower(coalesce(filtered.genre, '')) end asc,
        case when sort_value = 'subgenre_asc' then lower(coalesce(filtered.subgenre, '')) end asc,
        case when sort_value = 'magazine_asc' then lower(coalesce(filtered.magazine_name, '')) end asc,
        filtered.updated_at desc,
        filtered.id asc
    limit p_limit
    offset p_offset;
end;
$function$;

revoke all on function public.list_article_library_v2(integer, integer, text, text, text, text, text, text, text, text)
from public, anon;
grant execute on function public.list_article_library_v2(integer, integer, text, text, text, text, text, text, text, text)
to authenticated;

comment on function public.list_article_library_v2(integer, integer, text, text, text, text, text, text, text, text) is
    'PWA Article Library 2.0 metadata-only paged listing. Never returns article body or workspace bodies.';

commit;
