-- Harden SECURITY DEFINER entry points and make Fresh knowledge separation
-- effective even for clients that query knowledge_catalog directly.

revoke all on function public.get_my_creator_dashboard() from public, anon;
revoke all on function public.update_my_creator_profile(jsonb) from public, anon;
revoke all on function public.get_creator_ranking(text, integer) from public, anon;
revoke all on function public.list_my_active_knowledge_catalog() from public, anon;

grant execute on function public.get_my_creator_dashboard() to authenticated;
grant execute on function public.update_my_creator_profile(jsonb) to authenticated;
grant execute on function public.get_creator_ranking(text, integer) to authenticated;
grant execute on function public.list_my_active_knowledge_catalog() to authenticated;

revoke all on function private.ensure_creator_account() from public, anon, authenticated;
revoke all on function private.track_creator_article_completion() from public, anon, authenticated;
revoke all on function private.refresh_creator_rankings() from public, anon, authenticated;
revoke all on function private.enqueue_due_knowledge_refreshes() from public, anon, authenticated;

-- Existing clients historically read active knowledge_catalog rows directly.
-- Keep that route compatible while enforcing the same Stable/Fresh visibility.
drop policy if exists knowledge_catalog_select_active_or_admin on public.knowledge_catalog;
create policy knowledge_catalog_select_active_or_admin
on public.knowledge_catalog
for select
to authenticated
using (
    (select private.is_active_admin())
    or (
        (select private.is_active_profile())
        and status = 'active'
        and (
            release_channel = 'both'
            or stable_available_at <= now()
            or (select public.can_access_product('AAS-NOTE-CREATOR-CLUB'))
        )
    )
);
