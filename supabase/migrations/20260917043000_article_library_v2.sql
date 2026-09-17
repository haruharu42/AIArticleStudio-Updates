-- Article Library 2.0: compact server-side listing for the PWA.
-- Magazine metadata remains in article_workspaces.request_json so the frozen
-- Windows article schema stays compatible.

create index if not exists articles_owner_status_updated_idx
  on public.articles (user_id, status, updated_at desc, id);

create index if not exists articles_owner_genre_updated_idx
  on public.articles (user_id, genre, subgenre, updated_at desc, id);

create index if not exists article_workspaces_owner_magazine_name_idx
  on public.article_workspaces (user_id, ((request_json ->> 'magazine_name')))
  where coalesce(request_json ->> 'magazine_enabled', 'false') = 'true';

create or replace function public.list_article_library_page(
  p_query text default null,
  p_publication_target text default null,
  p_article_type text default null,
  p_status text default null,
  p_genre text default null,
  p_subgenre text default null,
  p_magazine_name text default null,
  p_sort text default 'updated_desc',
  p_offset integer default 0,
  p_limit integer default 25
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
  price integer,
  tags text[],
  revision integer,
  created_at timestamptz,
  updated_at timestamptz,
  magazine_enabled boolean,
  magazine_name text,
  magazine_series text,
  magazine_order integer,
  magazine_role text
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
  v_target text := nullif(btrim(coalesce(p_publication_target, '')), '');
  v_type text := nullif(btrim(coalesce(p_article_type, '')), '');
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
  v_genre text := nullif(btrim(coalesce(p_genre, '')), '');
  v_subgenre text := nullif(btrim(coalesce(p_subgenre, '')), '');
  v_magazine text := nullif(btrim(coalesce(p_magazine_name, '')), '');
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not public.can_access_product('AAS-PWA-BETA') then
    raise exception 'pwa entitlement required' using errcode = '42501';
  end if;

  if p_offset is null or p_offset < 0 then
    raise exception 'invalid offset' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 51 then
    raise exception 'invalid limit' using errcode = '22023';
  end if;
  if coalesce(p_sort, '') not in ('updated_desc','updated_asc','created_desc','created_asc','title_asc','title_desc') then
    raise exception 'invalid sort' using errcode = '22023';
  end if;
  if v_type is not null and v_type not in ('free','paid') then
    raise exception 'invalid article type' using errcode = '22023';
  end if;
  if v_status is not null and v_status not in ('draft','writing','ready','waiting_publish','published','on_hold','archived') then
    raise exception 'invalid article status' using errcode = '22023';
  end if;

  return query
  select
    a.id,
    a.user_id,
    a.title,
    a.publication_target,
    a.article_type,
    a.genre,
    a.subgenre,
    a.status,
    a.price,
    a.tags,
    a.revision,
    a.created_at,
    a.updated_at,
    coalesce(w.request_json ->> 'magazine_enabled', 'false') = 'true' as magazine_enabled,
    nullif(btrim(coalesce(w.request_json ->> 'magazine_name', '')), '') as magazine_name,
    nullif(btrim(coalesce(w.request_json ->> 'magazine_series', '')), '') as magazine_series,
    case
      when coalesce(w.request_json ->> 'magazine_order', '') ~ '^[0-9]{1,3}$'
        then (w.request_json ->> 'magazine_order')::integer
      else null
    end as magazine_order,
    case
      when coalesce(w.request_json ->> 'magazine_role', '') in ('intro','standard','summary','bonus')
        then w.request_json ->> 'magazine_role'
      else null
    end as magazine_role
  from public.articles a
  left join public.article_workspaces w
    on w.article_id = a.id and w.user_id = a.user_id
  where a.user_id = v_user_id
    and (v_target is null or a.publication_target = v_target)
    and (v_type is null or a.article_type = v_type)
    and (v_status is null or a.status = v_status)
    and (v_genre is null or a.genre = v_genre)
    and (v_subgenre is null or a.subgenre = v_subgenre)
    and (v_magazine is null or (
      coalesce(w.request_json ->> 'magazine_enabled', 'false') = 'true'
      and w.request_json ->> 'magazine_name' = v_magazine
    ))
    and (v_query is null or (
      a.title ilike '%' || v_query || '%'
      or coalesce(a.genre, '') ilike '%' || v_query || '%'
      or coalesce(a.subgenre, '') ilike '%' || v_query || '%'
      or exists (select 1 from unnest(a.tags) t where t ilike '%' || v_query || '%')
      or coalesce(w.request_json ->> 'magazine_name', '') ilike '%' || v_query || '%'
    ))
  order by
    case when p_sort = 'updated_desc' then a.updated_at end desc,
    case when p_sort = 'updated_asc' then a.updated_at end asc,
    case when p_sort = 'created_desc' then a.created_at end desc,
    case when p_sort = 'created_asc' then a.created_at end asc,
    case when p_sort = 'title_asc' then lower(a.title) end asc,
    case when p_sort = 'title_desc' then lower(a.title) end desc,
    a.id asc
  offset p_offset
  limit p_limit;
end;
$$;

revoke all on function public.list_article_library_page(text,text,text,text,text,text,text,text,integer,integer) from public;
revoke all on function public.list_article_library_page(text,text,text,text,text,text,text,text,integer,integer) from anon;
grant execute on function public.list_article_library_page(text,text,text,text,text,text,text,text,integer,integer) to authenticated;
