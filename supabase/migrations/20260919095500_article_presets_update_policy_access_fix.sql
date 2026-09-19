-- Ensure UPDATE visibility for article presets requires active PWA access on both USING and WITH CHECK.

drop policy if exists article_presets_update_own_active on public.article_presets;

create policy article_presets_update_own_active
on public.article_presets
for update
to authenticated
using (
    user_id = (select auth.uid())
    and (select private.is_active_profile())
    and (select public.can_access_product('AAS-PWA-BETA'))
)
with check (
    user_id = (select auth.uid())
    and (select private.is_active_profile())
    and (select public.can_access_product('AAS-PWA-BETA'))
);
