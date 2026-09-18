-- Profile avatar Storage foundation.
-- PWA-only and additive: no Windows release/update contract changes.
-- Avatars are intentionally public profile media; upload/update/delete remain owner-only.

insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
values (
    'profile-avatars',
    'profile-avatars',
    true,
    512000,
    array['image/webp']::text[]
)
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile avatars select own metadata" on storage.objects;
create policy "profile avatars select own metadata"
on storage.objects
for select
to authenticated
using (
    bucket_id = 'profile-avatars'
    and name = (select auth.uid())::text || '/avatar.webp'
);

drop policy if exists "profile avatars insert own image" on storage.objects;
create policy "profile avatars insert own image"
on storage.objects
for insert
to authenticated
with check (
    bucket_id = 'profile-avatars'
    and name = (select auth.uid())::text || '/avatar.webp'
    and storage.extension(name) = 'webp'
);

drop policy if exists "profile avatars update own image" on storage.objects;
create policy "profile avatars update own image"
on storage.objects
for update
to authenticated
using (
    bucket_id = 'profile-avatars'
    and name = (select auth.uid())::text || '/avatar.webp'
)
with check (
    bucket_id = 'profile-avatars'
    and name = (select auth.uid())::text || '/avatar.webp'
    and storage.extension(name) = 'webp'
);

drop policy if exists "profile avatars delete own image" on storage.objects;
create policy "profile avatars delete own image"
on storage.objects
for delete
to authenticated
using (
    bucket_id = 'profile-avatars'
    and name = (select auth.uid())::text || '/avatar.webp'
);
