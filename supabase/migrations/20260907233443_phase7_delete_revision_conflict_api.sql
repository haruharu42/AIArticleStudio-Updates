-- Phase 7B: return delete revision conflicts as HTTP 409 with JSON code 40001.
-- Preserve identity, ACL, active/owner checks, row lock, asset guard and triggers.
-- No article, image, profile or entitlement contents are changed.
-- Matches the existing update_article_with_workspace PostgREST error contract.
do $phase7_guard$
begin
    if (select md5(prosrc) from pg_proc
        where oid='public.delete_article(uuid,integer)'::regprocedure)
       <> '0ff1e666a576720d62188d6ad8bb842e' then
        raise exception 'Unexpected delete_article definition; migration stopped';
    end if;
end;
$phase7_guard$;

CREATE OR REPLACE FUNCTION public.delete_article(p_article_id uuid, p_expected_revision integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    current_user_id uuid := (select auth.uid());
    current_revision integer;
    deleted_article_id uuid;
begin
    if current_user_id is null or not (select private.is_active_profile()) then
        raise exception 'active profile required' using errcode = '42501';
    end if;

    if p_expected_revision is null or p_expected_revision < 1 then
        raise exception 'expected revision is required' using errcode = '22023';
    end if;

    select article.revision
    into current_revision
    from public.articles as article
    where article.id = p_article_id
      and article.user_id = current_user_id
    for update;

    if not found then
        raise exception 'article not found' using errcode = 'P0002';
    end if;

    if current_revision <> p_expected_revision then
        raise sqlstate 'PGRST' using
            message = jsonb_build_object(
                'code', '40001',
                'message', 'article revision conflict',
                'details', 'The expected revision is stale.',
                'hint', 'Reload the article before deleting again.'
            )::text,
            detail = jsonb_build_object(
                'status', 409,
                'headers', jsonb_build_object()
            )::text;
    end if;

    if exists (
        select 1
        from public.article_assets as asset
        where asset.article_id = p_article_id
          and asset.user_id = current_user_id
    ) then
        raise exception using errcode = 'P0001', message = 'article_has_assets';
    end if;

    delete from public.articles as article
    where article.id = p_article_id
      and article.user_id = current_user_id
      and article.revision = p_expected_revision
    returning article.id into deleted_article_id;

    if deleted_article_id is null then
        raise sqlstate 'PGRST' using
            message = jsonb_build_object(
                'code', '40001',
                'message', 'article revision conflict',
                'details', 'The expected revision is stale.',
                'hint', 'Reload the article before deleting again.'
            )::text,
            detail = jsonb_build_object(
                'status', 409,
                'headers', jsonb_build_object()
            )::text;
    end if;

    return deleted_article_id;
end;
$function$;
