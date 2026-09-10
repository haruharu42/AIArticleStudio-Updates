-- Phase 8: optimistic image metadata edits and checked lifecycle wrappers.
-- Existing Phase 4 RPC signatures, Storage policies, and article revisions stay compatible.
begin;

create function private.phase8_check_article(p_article_id uuid, p_expected_revision integer)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
    actor uuid := (select auth.uid());
    current_revision integer;
begin
    if actor is null or not (select private.is_active_profile())
       or not ((select public.can_access_product('AAS-WIN-BETA'))
               or (select public.can_access_product('AAS-PWA-BETA'))) then
        raise exception 'cloud article entitlement required' using errcode = '42501';
    end if;
    select a.revision into current_revision from public.articles a
      where a.id=p_article_id and a.user_id=actor for update;
    if not found then raise exception 'article not found' using errcode='P0002'; end if;
    if p_expected_revision is not null and p_expected_revision <> current_revision then
        raise sqlstate 'PGRST' using
          message='{"code":"40001","message":"article revision conflict","details":"Reload before changing images.","hint":null}',
          detail='{"status":409,"headers":{}}';
    end if;
end;
$fn$;
revoke all on function private.phase8_check_article(uuid,integer) from public, anon, authenticated, service_role;

create function public.prepare_article_asset_checked(
    p_article_id uuid, p_expected_article_revision integer,
    p_asset_type text, p_original_filename text, p_mime_type text, p_size_bytes bigint,
    p_sort_order integer, p_insertion_marker text, p_alt_text text, p_checksum_sha256 text
) returns public.article_assets language plpgsql security definer set search_path = '' as $fn$
declare
    prepared_id uuid;
    result public.article_assets%rowtype;
begin
    if p_expected_article_revision is null or p_expected_article_revision < 1
       or p_checksum_sha256 is null or p_checksum_sha256 !~ '^[0-9a-f]{64}$' then
        raise exception 'invalid revision or checksum' using errcode='22023';
    end if;
    if p_asset_type is null or p_asset_type not in ('cover','inline') then
        raise exception 'invalid asset type' using errcode='22023';
    end if;
    if p_asset_type='inline' and nullif(trim(p_insertion_marker),'') is null then
        raise exception 'inline marker required' using errcode='22023';
    end if;
    perform private.phase8_check_article(p_article_id,p_expected_article_revision);
    select prepared.asset_id into prepared_id from public.prepare_article_asset(
        p_article_id,p_asset_type,p_original_filename,p_mime_type,p_size_bytes,
        p_sort_order,p_insertion_marker,p_alt_text
    ) prepared;
    update public.article_assets set checksum_sha256=p_checksum_sha256
      where id=prepared_id and user_id=(select auth.uid()) returning * into result;
    return result;
end;
$fn$;
revoke all on function public.prepare_article_asset_checked(uuid,integer,text,text,text,bigint,integer,text,text,text) from public, anon;
grant execute on function public.prepare_article_asset_checked(uuid,integer,text,text,text,bigint,integer,text,text,text) to authenticated;

create function public.transition_article_asset_checked(
    p_article_id uuid, p_asset_id uuid, p_expected_updated_at timestamptz,
    p_expected_article_revision integer, p_action text,
    p_width integer default null, p_height integer default null,
    p_checksum_sha256 text default null
) returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
    asset public.article_assets%rowtype;
    result public.article_assets%rowtype;
    deleted_id uuid;
begin
    if p_expected_updated_at is null or p_expected_article_revision is null
       or p_expected_article_revision < 1
       or p_action is null or p_action not in ('finalize','begin_delete','cancel_pending','finalize_delete') then
        raise exception 'invalid image operation' using errcode='22023';
    end if;
    perform private.phase8_check_article(p_article_id,p_expected_article_revision);
    select a.* into asset from public.article_assets a
      where a.id=p_asset_id and a.article_id=p_article_id and a.user_id=(select auth.uid()) for update;
    if not found then raise exception 'article asset not found' using errcode='P0002'; end if;
    if asset.updated_at <> p_expected_updated_at then
        raise sqlstate 'PGRST' using
          message='{"code":"40001","message":"image metadata conflict","details":"Reload images before retrying.","hint":null}',
          detail='{"status":409,"headers":{}}';
    end if;
    case p_action
      when 'finalize' then
        if asset.checksum_sha256 is not null and p_checksum_sha256 is distinct from asset.checksum_sha256 then
            raise exception 'image checksum differs from prepared upload' using errcode='22023';
        end if;
        select * into result from public.finalize_article_asset(p_asset_id,p_width,p_height,p_checksum_sha256);
      when 'begin_delete' then
        if asset.status='delete_pending' then result := asset;
        else select * into result from public.begin_delete_article_asset(p_asset_id); end if;
      when 'cancel_pending' then
        deleted_id := public.cancel_pending_article_asset(p_asset_id);
      when 'finalize_delete' then
        deleted_id := public.finalize_delete_article_asset(p_asset_id);
    end case;
    if deleted_id is not null then return jsonb_build_object('deleted_asset_id',deleted_id); end if;
    return jsonb_build_object('asset',to_jsonb(result));
end;
$fn$;
revoke all on function public.transition_article_asset_checked(uuid,uuid,timestamptz,integer,text,integer,integer,text) from public, anon;
grant execute on function public.transition_article_asset_checked(uuid,uuid,timestamptz,integer,text,integer,integer,text) to authenticated;

create function public.update_article_assets_metadata(p_article_id uuid, p_changes jsonb)
returns setof public.article_assets language plpgsql security definer set search_path = '' as $fn$
declare
    item jsonb;
    asset public.article_assets%rowtype;
    marker text;
    actor uuid := (select auth.uid());
    stamp timestamptz;
begin
    perform private.phase8_check_article(p_article_id,null);
    if p_changes is null or jsonb_typeof(p_changes)<>'array' then
        raise exception 'image changes must be an array' using errcode='22023';
    end if;
    if jsonb_array_length(p_changes)<1 or jsonb_array_length(p_changes)>500 then
        raise exception 'invalid image change count' using errcode='22023';
    end if;
    if (select count(distinct value->>'id') from jsonb_array_elements(p_changes)) <> jsonb_array_length(p_changes) then
        raise exception 'duplicate or missing image id' using errcode='22023';
    end if;
    -- Article lock serializes prepare; row locks serialize legacy lifecycle RPCs.
    perform 1 from public.article_assets a where a.article_id=p_article_id and a.user_id=actor order by a.id for update;
    for item in select value from jsonb_array_elements(p_changes) loop
        if jsonb_typeof(item)<>'object' or not item ?& array['id','expected_updated_at','sort_order','insertion_marker','alt_text']
           or (item - array['id','expected_updated_at','sort_order','insertion_marker','alt_text']) <> '{}'::jsonb then
            raise exception 'invalid image metadata fields' using errcode='22023';
        end if;
        select a.* into asset from public.article_assets a
          where a.id=(item->>'id')::uuid and a.article_id=p_article_id and a.user_id=actor;
        if not found then raise exception 'article asset not found' using errcode='P0002'; end if;
        if asset.updated_at is distinct from (item->>'expected_updated_at')::timestamptz or asset.status<>'ready' then
            raise sqlstate 'PGRST' using
              message='{"code":"40001","message":"image metadata conflict","details":"Keep your draft and compare the latest images.","hint":null}',
              detail='{"status":409,"headers":{}}';
        end if;
        if jsonb_typeof(item->'sort_order')<>'number' or (item->>'sort_order') !~ '^[0-9]+$'
           or (item->>'sort_order')::numeric > 2147483647
           or jsonb_typeof(item->'alt_text') not in ('string','null')
           or length(item->>'alt_text')>2000
           or jsonb_typeof(item->'insertion_marker') not in ('string','null') then
            raise exception 'invalid image metadata' using errcode='22023';
        end if;
        marker := nullif(trim(item->>'insertion_marker'),'');
        if (asset.asset_type='cover' and marker is not null)
           or (asset.asset_type='inline' and (marker is null or length(marker)>500)) then
            raise exception 'invalid insertion marker' using errcode='22023';
        end if;
    end loop;
    -- Null is allowed by the existing contract. Clear only the changed inline
    -- markers inside this transaction so atomic marker swaps remain possible.
    update public.article_assets a set insertion_marker=null
      where a.article_id=p_article_id and a.user_id=actor and a.asset_type='inline'
        and a.id in (select (value->>'id')::uuid from jsonb_array_elements(p_changes));
    stamp := clock_timestamp();
    for item in select value from jsonb_array_elements(p_changes) loop
        update public.article_assets a set
          sort_order=(item->>'sort_order')::integer,
          insertion_marker=nullif(trim(item->>'insertion_marker'),''),
          alt_text=item->>'alt_text',
          updated_at=greatest(stamp,a.updated_at + interval '1 microsecond')
          where a.id=(item->>'id')::uuid and a.article_id=p_article_id and a.user_id=actor;
    end loop;
    return query select a.* from public.article_assets a
      where a.article_id=p_article_id and a.user_id=actor order by a.sort_order,a.created_at,a.id;
end;
$fn$;
revoke all on function public.update_article_assets_metadata(uuid,jsonb) from public, anon;
grant execute on function public.update_article_assets_metadata(uuid,jsonb) to authenticated;

comment on function public.update_article_assets_metadata(uuid,jsonb) is
 'Phase 8: atomic owner-only image metadata edits; updated_at optimistic checks; no article/workspace or Storage byte changes.';
commit;
