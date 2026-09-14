begin;

create table public.commerce_sales_settings (
    id smallint primary key default 1,
    external_sales_enabled boolean not null default true,
    access_code_enabled boolean not null default true,
    stripe_checkout_enabled boolean not null default false,
    pwa_7day_enabled boolean not null default false,
    pwa_monthly_enabled boolean not null default false,
    windows_monthly_enabled boolean not null default false,
    bundle_monthly_enabled boolean not null default false,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles(id) on delete set null,
    constraint commerce_sales_settings_singleton_check check (id = 1)
);

insert into public.commerce_sales_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.commerce_sales_settings enable row level security;
alter table public.commerce_sales_settings force row level security;
revoke all on table public.commerce_sales_settings from public, anon, authenticated;
grant select on table public.commerce_sales_settings to service_role;

create trigger commerce_sales_settings_set_updated_at
before update on public.commerce_sales_settings
for each row execute function private.set_updated_at();

create or replace function public.admin_get_commerce_sales_settings()
returns table (
    external_sales_enabled boolean,
    access_code_enabled boolean,
    stripe_checkout_enabled boolean,
    pwa_7day_enabled boolean,
    pwa_monthly_enabled boolean,
    windows_monthly_enabled boolean,
    bundle_monthly_enabled boolean,
    updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
    if (select auth.uid()) is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode = '42501';
    end if;

    return query
    select
        settings.external_sales_enabled,
        settings.access_code_enabled,
        settings.stripe_checkout_enabled,
        settings.pwa_7day_enabled,
        settings.pwa_monthly_enabled,
        settings.windows_monthly_enabled,
        settings.bundle_monthly_enabled,
        settings.updated_at
    from public.commerce_sales_settings as settings
    where settings.id = 1;
end;
$function$;

revoke all on function public.admin_get_commerce_sales_settings() from public, anon;
grant execute on function public.admin_get_commerce_sales_settings() to authenticated;

create or replace function public.admin_update_commerce_sales_settings(
    p_external_sales_enabled boolean,
    p_access_code_enabled boolean,
    p_stripe_checkout_enabled boolean,
    p_pwa_7day_enabled boolean,
    p_pwa_monthly_enabled boolean,
    p_windows_monthly_enabled boolean,
    p_bundle_monthly_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
    if (select auth.uid()) is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode = '42501';
    end if;

    if p_external_sales_enabled is null
       or p_access_code_enabled is null
       or p_stripe_checkout_enabled is null
       or p_pwa_7day_enabled is null
       or p_pwa_monthly_enabled is null
       or p_windows_monthly_enabled is null
       or p_bundle_monthly_enabled is null then
        raise exception 'sales settings cannot be null' using errcode = '22023';
    end if;

    update public.commerce_sales_settings
       set external_sales_enabled = p_external_sales_enabled,
           access_code_enabled = p_access_code_enabled,
           stripe_checkout_enabled = p_stripe_checkout_enabled,
           pwa_7day_enabled = p_pwa_7day_enabled,
           pwa_monthly_enabled = p_pwa_monthly_enabled,
           windows_monthly_enabled = p_windows_monthly_enabled,
           bundle_monthly_enabled = p_bundle_monthly_enabled,
           updated_by = (select auth.uid())
     where id = 1;
end;
$function$;

revoke all on function public.admin_update_commerce_sales_settings(boolean, boolean, boolean, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.admin_update_commerce_sales_settings(boolean, boolean, boolean, boolean, boolean, boolean, boolean) to authenticated;

-- Keep the existing invitation/usage-code flow, but make redemption obey the
-- administrator's access-code switch. Existing entitlements are intentionally
-- untouched when the switch is disabled.
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

    if not coalesce((
        select settings.access_code_enabled
        from public.commerce_sales_settings as settings
        where settings.id = 1
    ), false) then
        raise exception 'access code redemption is disabled' using errcode = '55000';
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

revoke all on function public.redeem_pwa_invite(text) from public, anon;
grant execute on function public.redeem_pwa_invite(text) to authenticated;

commit;
