begin;

-- Cover every foreign key reported by the Supabase performance advisor.
-- These indexes improve parent-row updates/deletes and joins without changing
-- any application-visible behavior or RLS policy.
create index if not exists billing_checkout_sessions_plan_code_idx
    on public.billing_checkout_sessions (plan_code);

create index if not exists billing_subscriptions_plan_code_idx
    on public.billing_subscriptions (plan_code);

create index if not exists knowledge_candidate_decisions_reviewed_by_idx
    on public.knowledge_candidate_decisions (reviewed_by);

create index if not exists knowledge_catalog_created_by_idx
    on public.knowledge_catalog (created_by);

create index if not exists pwa_invites_created_by_idx
    on public.pwa_invites (created_by);

commit;
