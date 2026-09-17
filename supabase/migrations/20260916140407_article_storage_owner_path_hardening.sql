-- Defense in depth for article Storage ownership.
-- Existing article_assets metadata ownership remains authoritative; this adds
-- an independent path-prefix check for the documented
-- <auth.uid()>/<article_id>/<asset_id>.<ext> object layout.

drop policy if exists article_assets_storage_insert_prepared on storage.objects;
create policy article_assets_storage_insert_prepared
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'article-assets'
    and split_part(name, '/', 1) = (select auth.uid())::text
    and (
        (select public.can_access_product('AAS-WIN-BETA'))
        or (select public.can_access_product('AAS-PWA-BETA'))
    )
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
    and split_part(name, '/', 1) = (select auth.uid())::text
    and (
        (select public.can_access_product('AAS-WIN-BETA'))
        or (select public.can_access_product('AAS-PWA-BETA'))
    )
    and exists (
        select 1
        from public.article_assets as asset
        where asset.user_id = (select auth.uid())
          and asset.status = 'ready'
          and asset.storage_bucket = storage.objects.bucket_id
          and asset.storage_path = storage.objects.name
    )
);

drop policy if exists article_assets_storage_select_delete_pending on storage.objects;
create policy article_assets_storage_select_delete_pending
on storage.objects
for select
to authenticated
using (
    bucket_id = 'article-assets'
    and split_part(name, '/', 1) = (select auth.uid())::text
    and (
        (select public.can_access_product('AAS-WIN-BETA'))
        or (select public.can_access_product('AAS-PWA-BETA'))
    )
    and exists (
        select 1
        from public.article_assets as asset
        where asset.user_id = (select auth.uid())
          and asset.status = 'delete_pending'
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
    and split_part(name, '/', 1) = (select auth.uid())::text
    and (
        (select public.can_access_product('AAS-WIN-BETA'))
        or (select public.can_access_product('AAS-PWA-BETA'))
    )
    and exists (
        select 1
        from public.article_assets as asset
        where asset.user_id = (select auth.uid())
          and asset.status = 'delete_pending'
          and asset.storage_bucket = storage.objects.bucket_id
          and asset.storage_path = storage.objects.name
    )
);
