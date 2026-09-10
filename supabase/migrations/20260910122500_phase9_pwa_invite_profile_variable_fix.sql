-- Phase 9 production hotfix: avoid PostgreSQL CURRENT_ROLE keyword collision in redeem_pwa_invite.
-- The previous implementation declared a PL/pgSQL variable named current_role; in SQL expressions
-- CURRENT_ROLE resolves to the session role rather than the intended profile role. Rename the
-- profile variables so authenticated users can redeem invitations while preserving all guards.

begin;

create or replace function public.redeem_pwa_invite(
    p_invite_code text
)
returns table (
    aas_user_id text,
    product_code text,
    entitlement_status text,
    entitlement_expires_at timestamptz,
    profile_status text
)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
    current_user_id uuid := (select auth.uid());
    current_aas_id text;
    profile_role text;
    profile_state text;
    parsed_code uuid;
    selected_invite public.pwa_invites%rowtype;
    pwa_product_id uuid;
    entitlement_id uuid;
begin
    if current_user_id is null then
        raise exception 'authentication required' using errcode = '42501';
    end if;

    select profile.aas_user_id, profile.role, profile.status
    into current_aas_id, profile_role, profile_state
    from public.profiles as profile
    where profile.id = current_user_id
    for update;

    if not found or profile_role <> 'user' or profile_state not in ('pending', 'active') then
        raise exception 'eligible user profile required' using errcode = '42501';
    end if;

    begin
        parsed_code := nullif(trim(p_invite_code), '')::uuid;
    exception when invalid_text_representation then
        raise exception 'invalid invite code' using errcode = '22023';
    end;

    if parsed_code is null then
        raise exception 'invite code is required' using errcode = '22023';
    end if;

    select invite.*
    into selected_invite
    from public.pwa_invites as invite
    where invite.code = parsed_code
    for update;

    if not found
       or selected_invite.status <> 'active'
       or selected_invite.use_count >= selected_invite.max_uses
       or (selected_invite.expires_at is not null and selected_invite.expires_at <= now())
       or (
           selected_invite.entitlement_expires_at is not null
           and selected_invite.entitlement_expires_at <= now()
       )
    then
        raise exception 'invite unavailable' using errcode = 'P0002';
    end if;

    if exists (
        select 1
        from public.pwa_invite_redemptions as redemption
        where redemption.invite_id = selected_invite.id
          and redemption.user_id = current_user_id
    ) then
        raise exception 'invite already redeemed by user' using errcode = '22023';
    end if;

    select product.id
    into pwa_product_id
    from public.products as product
    where product.product_code = 'AAS-PWA-BETA'
      and product.status = 'active';

    if not found then
        raise exception 'active PWA product not found' using errcode = 'P0002';
    end if;

    insert into public.user_entitlements as entitlement (
        user_id,
        product_id,
        status,
        sales_channel,
        external_reference,
        granted_at,
        expires_at
    ) values (
        current_user_id,
        pwa_product_id,
        'active',
        selected_invite.sales_channel,
        selected_invite.external_reference,
        now(),
        selected_invite.entitlement_expires_at
    )
    on conflict (user_id, product_id) where status = 'active'
    do update set
        sales_channel = excluded.sales_channel,
        external_reference = excluded.external_reference,
        granted_at = excluded.granted_at,
        expires_at = excluded.expires_at
    where entitlement.expires_at is not null
      and entitlement.expires_at <= now()
    returning entitlement.id into entitlement_id;

    if entitlement_id is null then
        raise exception 'PWA entitlement already active' using errcode = '22023';
    end if;

    insert into public.pwa_invite_redemptions (
        invite_id,
        user_id
    ) values (
        selected_invite.id,
        current_user_id
    );

    update public.pwa_invites
    set
        use_count = use_count + 1,
        status = case
            when use_count + 1 >= max_uses then 'exhausted'
            else 'active'
        end
    where id = selected_invite.id;

    return query
    select
        current_aas_id,
        'AAS-PWA-BETA'::text,
        entitlement.status,
        entitlement.expires_at,
        profile_state
    from public.user_entitlements as entitlement
    where entitlement.id = entitlement_id;
end;
$function$;

revoke all on function public.redeem_pwa_invite(text)
from public, anon;
grant execute on function public.redeem_pwa_invite(text)
to authenticated;

commit;
