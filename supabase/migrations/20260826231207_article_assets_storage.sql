-- Phase 4: shared article image Storage foundation only.
-- No Windows/PWA UI, updater, release, or local article-storage changes.

-- Supabase Storage bucket: private, 10 MiB/object, PNG/JPEG/WebP only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'article-assets',
    'article-assets',
    false,
    10485760,
    array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Composite parent key lets the child enforce article.user_id = asset.user_id.
alter table public.articles
    add constraint articles_id_user_id_key unique (id, user_id);

create table public.article_assets (
    id uuid primary key default gen_random_uuid(),
    article_id uuid not null,
    user_id uuid not null,
    asset_type text not null,
    status text not null default 'pending_upload',
    storage_bucket text not null default 'article-assets',
    storage_path text not null,
    original_filename text not null,
    mime_type text not null,
    size_bytes bigint not null,
    width integer,
    height integer,
    sort_order integer not null default 0,
    insertion_marker text,
    alt_text text,
    checksum_sha256 text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    uploaded_at timestamptz,
    delete_requested_at timestamptz,

    constraint article_assets_article_owner_fkey
        foreign key (article_id, user_id)
        references public.articles (id, user_id)
        on delete restrict,
    constraint article_assets_asset_type_check
        check (asset_type in ('cover', 'inline')),
    constraint article_assets_status_check
        check (status in ('pending_upload', 'ready', 'delete_pending')),
    constraint article_assets_storage_bucket_check
        check (storage_bucket = 'article-assets'),
    constraint article_assets_storage_path_check
        check (
            length(storage_path) between 1 and 300
            and storage_path = concat(user_id::text, '/', article_id::text, '/', id::text,
                case mime_type
                    when 'image/png' then '.png'
                    when 'image/jpeg' then '.jpg'
                    when 'image/webp' then '.webp'
                    else ''
                end)
        ),
    constraint article_assets_original_filename_check
        check (length(trim(original_filename)) between 1 and 255),
    constraint article_assets_mime_type_check
        check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
    constraint article_assets_size_bytes_check
        check (size_bytes between 1 and 10485760),
    constraint article_assets_width_check
        check (width is null or width > 0),
    constraint article_assets_height_check
        check (height is null or height > 0),
    constraint article_assets_sort_order_check
        check (sort_order >= 0),
    constraint article_assets_marker_check
        check (
            (asset_type = 'cover' and insertion_marker is null)
            or
            (asset_type = 'inline' and (
                insertion_marker is null
                or (length(trim(insertion_marker)) between 1 and 500)
            ))
        ),
    constraint article_assets_alt_text_check
        check (alt_text is null or length(alt_text) <= 2000),
    constraint article_assets_checksum_check
        check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'),
    constraint article_assets_upload_state_check
        check (
            (status = 'pending_upload' and uploaded_at is null and delete_requested_at is null)
            or
            (status = 'ready' and uploaded_at is not null and delete_requested_at is null)
            or
            (status = 'delete_pending' and uploaded_at is not null and delete_requested_at is not null)
        )
);

create unique index article_assets_storage_path_key
    on public.article_assets (storage_bucket, storage_path);

create index article_assets_user_article_idx
    on public.article_assets (user_id, article_id);

create index article_assets_article_status_idx
    on public.article_assets (article_id, status);

-- One lifecycle-active cover per article. Replacement is delete-old -> create-new.
create unique index article_assets_one_cover_per_article
    on public.article_assets (article_id)
    where asset_type = 'cover';

-- Avoid an ambiguous marker even during prepare/delete transitions.
create unique index article_assets_one_inline_marker_per_article
    on public.article_assets (article_id, insertion_marker)
    where asset_type = 'inline' and insertion_marker is not null;

alter table public.article_assets enable row level security;
alter table public.article_assets force row level security;

revoke all on table public.article_assets from public;
revoke all on table public.article_assets from anon;
revoke all on table public.article_assets from authenticated;
grant select on table public.article_assets to authenticated;

create policy article_assets_select_own_active
on public.article_assets
for select
to authenticated
using (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
    and (select private.is_active_profile())
);

create or replace function public.prepare_article_asset(
    p_article_id uuid,
    p_asset_type text,
    p_original_filename text,
    p_mime_type text,
    p_size_bytes bigint,
    p_sort_order integer default 0,
    p_insertion_marker text default null,
    p_alt_text text default null
)
returns table (
    asset_id uuid,
    storage_bucket text,
    storage_path text,
    status text
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    article_owner_id uuid;
    asset_type_value text := lower(trim(coalesce(p_asset_type, '')));
    mime_type_value text := lower(trim(coalesce(p_mime_type, '')));
    marker_value text := nullif(trim(p_insertion_marker), '');
    filename_value text := p_original_filename;
    alt_text_value text := p_alt_text;
    sort_order_value integer := coalesce(p_sort_order, 0);
    new_asset_id uuid := gen_random_uuid();
    extension_value text;
    new_storage_path text;
begin
    if current_user_id is null or not (select private.is_active_profile()) then
        raise exception 'active profile required' using errcode = '42501';
    end if;

    select article.user_id
    into article_owner_id
    from public.articles as article
    where article.id = p_article_id
    for update;

    if not found then
        raise exception 'article not found' using errcode = 'P0002';
    end if;

    if article_owner_id <> current_user_id then
        raise exception 'article not found' using errcode = 'P0002';
    end if;

    if asset_type_value not in ('cover', 'inline') then
        raise exception 'invalid asset type' using errcode = '22023';
    end if;

    if mime_type_value not in ('image/png', 'image/jpeg', 'image/webp') then
        raise exception 'invalid asset mime type' using errcode = '22023';
    end if;

    if filename_value is null or length(trim(filename_value)) < 1 or length(filename_value) > 255 then
        raise exception 'invalid original filename' using errcode = '22023';
    end if;

    if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > 10485760 then
        raise exception 'invalid asset size' using errcode = '22023';
    end if;

    if sort_order_value < 0 then
        raise exception 'invalid sort order' using errcode = '22023';
    end if;

    if alt_text_value is not null and length(alt_text_value) > 2000 then
        raise exception 'invalid alt text' using errcode = '22023';
    end if;

    if marker_value is not null and length(marker_value) > 500 then
        raise exception 'invalid insertion marker' using errcode = '22023';
    end if;

    if asset_type_value = 'cover' then
        marker_value := null;
        sort_order_value := 0;

        if exists (
            select 1
            from public.article_assets as asset
            where asset.article_id = p_article_id
              and asset.asset_type = 'cover'
        ) then
            raise exception using errcode = 'P0001', message = 'article_cover_exists';
        end if;
    elsif marker_value is not null and exists (
        select 1
        from public.article_assets as asset
        where asset.article_id = p_article_id
          and asset.asset_type = 'inline'
          and asset.insertion_marker = marker_value
    ) then
        raise exception using errcode = 'P0001', message = 'article_inline_marker_exists';
    end if;

    extension_value := case mime_type_value
        when 'image/png' then '.png'
        when 'image/jpeg' then '.jpg'
        when 'image/webp' then '.webp'
    end;

    new_storage_path := concat(
        current_user_id::text, '/',
        p_article_id::text, '/',
        new_asset_id::text,
        extension_value
    );

    insert into public.article_assets (
        id,
        article_id,
        user_id,
        asset_type,
        status,
        storage_bucket,
        storage_path,
        original_filename,
        mime_type,
        size_bytes,
        sort_order,
        insertion_marker,
        alt_text
    ) values (
        new_asset_id,
        p_article_id,
        current_user_id,
        asset_type_value,
        'pending_upload',
        'article-assets',
        new_storage_path,
        filename_value,
        mime_type_value,
        p_size_bytes,
        sort_order_value,
        marker_value,
        alt_text_value
    );

    return query
    select new_asset_id, 'article-assets'::text, new_storage_path, 'pending_upload'::text;
exception
    when unique_violation then
        if asset_type_value = 'cover' then
            raise exception using errcode = 'P0001', message = 'article_cover_exists';
        elsif marker_value is not null then
            raise exception using errcode = 'P0001', message = 'article_inline_marker_exists';
        end if;
        raise;
end;
$function$;

revoke all on function public.prepare_article_asset(uuid, text, text, text, bigint, integer, text, text) from public;
revoke all on function public.prepare_article_asset(uuid, text, text, text, bigint, integer, text, text) from anon;
grant execute on function public.prepare_article_asset(uuid, text, text, text, bigint, integer, text, text) to authenticated;

create or replace function public.finalize_article_asset(
    p_asset_id uuid,
    p_width integer default null,
    p_height integer default null,
    p_checksum_sha256 text default null
)
returns public.article_assets
language plpgsql
security definer
set search_path to ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    current_asset public.article_assets%rowtype;
    object_metadata jsonb;
    object_size_text text;
    object_mime_type text;
    object_size bigint;
    checksum_value text := case
        when p_checksum_sha256 is null then null
        else lower(trim(p_checksum_sha256))
    end;
    finalized_asset public.article_assets%rowtype;
begin
    if current_user_id is null or not (select private.is_active_profile()) then
        raise exception 'active profile required' using errcode = '42501';
    end if;

    select asset.*
    into current_asset
    from public.article_assets as asset
    where asset.id = p_asset_id
      and asset.user_id = current_user_id
    for update;

    if not found then
        raise exception 'article asset not found' using errcode = 'P0002';
    end if;

    if current_asset.status <> 'pending_upload' then
        raise exception 'asset is not pending upload' using errcode = '22023';
    end if;

    if p_width is not null and p_width <= 0 then
        raise exception 'invalid image width' using errcode = '22023';
    end if;

    if p_height is not null and p_height <= 0 then
        raise exception 'invalid image height' using errcode = '22023';
    end if;

    if checksum_value is not null and checksum_value !~ '^[0-9a-f]{64}$' then
        raise exception 'invalid sha256 checksum' using errcode = '22023';
    end if;

    select object.metadata
    into object_metadata
    from storage.objects as object
    where object.bucket_id = current_asset.storage_bucket
      and object.name = current_asset.storage_path
      and coalesce(object.is_delete_marker, false) = false;

    if not found then
        raise exception using errcode = 'P0001', message = 'storage_object_missing';
    end if;

    object_size_text := object_metadata ->> 'size';
    object_mime_type := lower(coalesce(object_metadata ->> 'mimetype', ''));

    if object_size_text is null or object_size_text !~ '^[0-9]+$' then
        raise exception using errcode = 'P0001', message = 'storage_object_metadata_invalid';
    end if;

    object_size := object_size_text::bigint;

    if object_size < 1 or object_size > 10485760 then
        raise exception using errcode = 'P0001', message = 'storage_object_size_invalid';
    end if;

    if object_mime_type <> current_asset.mime_type then
        raise exception using errcode = 'P0001', message = 'storage_object_mime_mismatch';
    end if;

    update public.article_assets as asset
    set status = 'ready',
        size_bytes = object_size,
        width = p_width,
        height = p_height,
        checksum_sha256 = checksum_value,
        uploaded_at = now(),
        updated_at = now()
    where asset.id = current_asset.id
      and asset.user_id = current_user_id
      and asset.status = 'pending_upload'
    returning asset.* into finalized_asset;

    if not found then
        raise exception 'asset state conflict' using errcode = '40001';
    end if;

    return finalized_asset;
end;
$function$;

revoke all on function public.finalize_article_asset(uuid, integer, integer, text) from public;
revoke all on function public.finalize_article_asset(uuid, integer, integer, text) from anon;
grant execute on function public.finalize_article_asset(uuid, integer, integer, text) to authenticated;

create or replace function public.begin_delete_article_asset(p_asset_id uuid)
returns public.article_assets
language plpgsql
security definer
set search_path to ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    current_asset public.article_assets%rowtype;
    changed_asset public.article_assets%rowtype;
begin
    if current_user_id is null or not (select private.is_active_profile()) then
        raise exception 'active profile required' using errcode = '42501';
    end if;

    select asset.*
    into current_asset
    from public.article_assets as asset
    where asset.id = p_asset_id
      and asset.user_id = current_user_id
    for update;

    if not found then
        raise exception 'article asset not found' using errcode = 'P0002';
    end if;

    if current_asset.status <> 'ready' then
        raise exception 'asset is not ready' using errcode = '22023';
    end if;

    update public.article_assets as asset
    set status = 'delete_pending',
        delete_requested_at = now(),
        updated_at = now()
    where asset.id = current_asset.id
      and asset.user_id = current_user_id
      and asset.status = 'ready'
    returning asset.* into changed_asset;

    if not found then
        raise exception 'asset state conflict' using errcode = '40001';
    end if;

    return changed_asset;
end;
$function$;

revoke all on function public.begin_delete_article_asset(uuid) from public;
revoke all on function public.begin_delete_article_asset(uuid) from anon;
grant execute on function public.begin_delete_article_asset(uuid) to authenticated;

create or replace function public.finalize_delete_article_asset(p_asset_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    current_asset public.article_assets%rowtype;
    deleted_asset_id uuid;
begin
    if current_user_id is null or not (select private.is_active_profile()) then
        raise exception 'active profile required' using errcode = '42501';
    end if;

    select asset.*
    into current_asset
    from public.article_assets as asset
    where asset.id = p_asset_id
      and asset.user_id = current_user_id
    for update;

    if not found then
        raise exception 'article asset not found' using errcode = 'P0002';
    end if;

    if current_asset.status <> 'delete_pending' then
        raise exception 'asset is not delete pending' using errcode = '22023';
    end if;

    if exists (
        select 1
        from storage.objects as object
        where object.bucket_id = current_asset.storage_bucket
          and object.name = current_asset.storage_path
          and coalesce(object.is_delete_marker, false) = false
    ) then
        raise exception using errcode = 'P0001', message = 'storage_object_still_exists';
    end if;

    delete from public.article_assets as asset
    where asset.id = current_asset.id
      and asset.user_id = current_user_id
      and asset.status = 'delete_pending'
    returning asset.id into deleted_asset_id;

    if deleted_asset_id is null then
        raise exception 'asset state conflict' using errcode = '40001';
    end if;

    return deleted_asset_id;
end;
$function$;

revoke all on function public.finalize_delete_article_asset(uuid) from public;
revoke all on function public.finalize_delete_article_asset(uuid) from anon;
grant execute on function public.finalize_delete_article_asset(uuid) to authenticated;

create or replace function public.cancel_pending_article_asset(p_asset_id uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    current_asset public.article_assets%rowtype;
    deleted_asset_id uuid;
begin
    if current_user_id is null or not (select private.is_active_profile()) then
        raise exception 'active profile required' using errcode = '42501';
    end if;

    select asset.*
    into current_asset
    from public.article_assets as asset
    where asset.id = p_asset_id
      and asset.user_id = current_user_id
    for update;

    if not found then
        raise exception 'article asset not found' using errcode = 'P0002';
    end if;

    if current_asset.status <> 'pending_upload' then
        raise exception 'asset is not pending upload' using errcode = '22023';
    end if;

    if exists (
        select 1
        from storage.objects as object
        where object.bucket_id = current_asset.storage_bucket
          and object.name = current_asset.storage_path
          and coalesce(object.is_delete_marker, false) = false
    ) then
        raise exception using errcode = 'P0001', message = 'storage_object_exists';
    end if;

    delete from public.article_assets as asset
    where asset.id = current_asset.id
      and asset.user_id = current_user_id
      and asset.status = 'pending_upload'
    returning asset.id into deleted_asset_id;

    if deleted_asset_id is null then
        raise exception 'asset state conflict' using errcode = '40001';
    end if;

    return deleted_asset_id;
end;
$function$;

revoke all on function public.cancel_pending_article_asset(uuid) from public;
revoke all on function public.cancel_pending_article_asset(uuid) from anon;
grant execute on function public.cancel_pending_article_asset(uuid) to authenticated;

-- Storage policies are metadata-gated. storage.objects remains API-managed.
drop policy if exists article_assets_storage_insert_prepared on storage.objects;
create policy article_assets_storage_insert_prepared
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'article-assets'
    and exists (
        select 1
        from public.article_assets as asset
        where asset.user_id = (select auth.uid())
          and asset.status = 'pending_upload'
          and asset.storage_bucket = storage.objects.bucket_id
          and asset.storage_path = storage.objects.name
    )
);

drop policy if exists article_assets_storage_select_ready on storage.objects;
create policy article_assets_storage_select_ready
on storage.objects
for select
to authenticated
using (
    bucket_id = 'article-assets'
    and exists (
        select 1
        from public.article_assets as asset
        where asset.user_id = (select auth.uid())
          and asset.status = 'ready'
          and asset.storage_bucket = storage.objects.bucket_id
          and asset.storage_path = storage.objects.name
    )
);

drop policy if exists article_assets_storage_delete_pending on storage.objects;
create policy article_assets_storage_delete_pending
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'article-assets'
    and exists (
        select 1
        from public.article_assets as asset
        where asset.user_id = (select auth.uid())
          and asset.status = 'delete_pending'
          and asset.storage_bucket = storage.objects.bucket_id
          and asset.storage_path = storage.objects.name
    )
);

-- Deliberately no UPDATE policy on storage.objects for article-assets: no overwrite/upsert.

-- Phase-2 delete semantics, extended only to reject articles that still own assets.
create or replace function public.delete_article(
    p_article_id uuid,
    p_expected_revision integer
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
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
        raise exception 'article revision conflict' using errcode = '40001';
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
        raise exception 'article revision conflict' using errcode = '40001';
    end if;

    return deleted_article_id;
end;
$function$;

revoke all on function public.delete_article(uuid, integer) from public;
revoke all on function public.delete_article(uuid, integer) from anon;
grant execute on function public.delete_article(uuid, integer) to authenticated;
