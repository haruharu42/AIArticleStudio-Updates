-- Atomic admin management for note Creator Club plan assignments.
-- Keeps membership switching separate from the core PWA entitlement.

create or replace function public.admin_set_creator_membership_plan(
    p_target_user_id uuid,
    p_plan_code text,
    p_expires_at timestamptz default null,
    p_sales_channel text default 'note-membership-admin',
    p_external_reference text default null
)
returns table (
    plan_code text,
    product_code text,
    display_name text,
    expires_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
#variable_conflict use_column
declare
    normalized_plan_code text := upper(nullif(trim(p_plan_code), ''));
    normalized_sales_channel text := nullif(trim(p_sales_channel), '');
    normalized_external_reference text := nullif(trim(p_external_reference), '');
    target_role text;
    selected_plan public.creator_membership_plans%rowtype;
    selected_product_id uuid;
    grant_time timestamptz := now();
begin
    if (select auth.uid()) is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode = '42501';
    end if;

    if normalized_plan_code is null then
        raise exception 'membership plan code is required' using errcode = '22023';
    end if;
    if normalized_sales_channel is null or length(normalized_sales_channel) > 100 then
        raise exception 'invalid sales channel' using errcode = '22023';
    end if;
    if normalized_external_reference is not null and length(normalized_external_reference) > 255 then
        raise exception 'invalid external reference' using errcode = '22023';
    end if;
    if p_expires_at is not null and p_expires_at <= grant_time then
        raise exception 'expiry must be in the future' using errcode = '22023';
    end if;

    select profile.role
    into target_role
    from public.profiles as profile
    where profile.id = p_target_user_id
    for update;

    if not found then
        raise exception 'target profile not found' using errcode = 'P0002';
    end if;
    if target_role <> 'user' then
        raise exception 'creator membership can only be assigned to users' using errcode = '22023';
    end if;

    select plan.*
    into selected_plan
    from public.creator_membership_plans as plan
    where plan.plan_code = normalized_plan_code
      and plan.status = 'active';

    if not found then
        raise exception 'active creator membership plan not found' using errcode = 'P0002';
    end if;

    select product.id
    into selected_product_id
    from public.products as product
    where product.product_code = selected_plan.product_code
      and product.status = 'active';

    if not found then
        raise exception 'active membership product not found' using errcode = 'P0002';
    end if;

    update public.user_entitlements as entitlement
    set status = 'revoked'
    where entitlement.user_id = p_target_user_id
      and entitlement.status = 'active'
      and entitlement.product_id in (
          select product.id
          from public.creator_membership_plans as plan
          join public.products as product on product.product_code = plan.product_code
      );

    insert into public.user_entitlements as entitlement (
        user_id,
        product_id,
        status,
        sales_channel,
        external_reference,
        granted_at,
        expires_at
    ) values (
        p_target_user_id,
        selected_product_id,
        'active',
        normalized_sales_channel,
        normalized_external_reference,
        grant_time,
        p_expires_at
    )
    on conflict (user_id, product_id) where status = 'active'
    do update set
        sales_channel = excluded.sales_channel,
        external_reference = excluded.external_reference,
        granted_at = excluded.granted_at,
        expires_at = excluded.expires_at;

    return query
    select selected_plan.plan_code, selected_plan.product_code, selected_plan.display_name, p_expires_at;
end;
$function$;

create or replace function public.admin_clear_creator_membership_plan(p_target_user_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
    target_role text;
    revoked_count integer := 0;
begin
    if (select auth.uid()) is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode = '42501';
    end if;

    select profile.role
    into target_role
    from public.profiles as profile
    where profile.id = p_target_user_id
    for update;

    if not found then
        raise exception 'target profile not found' using errcode = 'P0002';
    end if;
    if target_role <> 'user' then
        raise exception 'creator membership can only be cleared from users' using errcode = '22023';
    end if;

    update public.user_entitlements as entitlement
    set status = 'revoked'
    where entitlement.user_id = p_target_user_id
      and entitlement.status = 'active'
      and entitlement.product_id in (
          select product.id
          from public.creator_membership_plans as plan
          join public.products as product on product.product_code = plan.product_code
      );

    get diagnostics revoked_count = row_count;
    return revoked_count;
end;
$function$;

revoke all on function public.admin_set_creator_membership_plan(uuid, text, timestamptz, text, text) from public, anon;
revoke all on function public.admin_clear_creator_membership_plan(uuid) from public, anon;
grant execute on function public.admin_set_creator_membership_plan(uuid, text, timestamptz, text, text) to authenticated;
grant execute on function public.admin_clear_creator_membership_plan(uuid) to authenticated;
