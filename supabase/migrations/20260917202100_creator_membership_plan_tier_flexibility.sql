-- Allow future horizontal note membership plans to share the same benefit tier.
-- The plan resolver still chooses the highest active tier and most recent entitlement.

drop index if exists public.creator_membership_plans_active_tier_idx;

create index if not exists creator_membership_plans_tier_lookup_idx
    on public.creator_membership_plans (tier_rank desc, sort_order, plan_code)
    where status = 'active';
