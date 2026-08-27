-- Phase 4 fix: Supabase Storage's multi-object delete endpoint executes
-- DELETE ... RETURNING *. A delete_pending object therefore needs narrowly
-- scoped SELECT visibility while the Storage API performs the authorized delete.
--
-- This does not expose other users' objects, does not grant anon access, and
-- does not add UPDATE/overwrite permission.

create policy article_assets_storage_select_delete_pending
on storage.objects
for select
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
