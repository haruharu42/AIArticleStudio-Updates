begin;

-- Contract-only no-op guard: fail deployment if the advisor-driven covering
-- indexes introduced earlier are accidentally removed from this migration set.
do $check$
begin
    if not exists (select 1 from pg_indexes where schemaname='public' and indexname='billing_checkout_sessions_plan_code_idx')
       or not exists (select 1 from pg_indexes where schemaname='public' and indexname='billing_subscriptions_plan_code_idx')
       or not exists (select 1 from pg_indexes where schemaname='public' and indexname='knowledge_candidate_decisions_reviewed_by_idx')
       or not exists (select 1 from pg_indexes where schemaname='public' and indexname='knowledge_catalog_created_by_idx')
       or not exists (select 1 from pg_indexes where schemaname='public' and indexname='pwa_invites_created_by_idx') then
        raise exception 'required foreign-key covering index is missing';
    end if;
end
$check$;

commit;
