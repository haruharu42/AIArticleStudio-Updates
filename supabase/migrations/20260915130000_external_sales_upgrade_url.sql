begin;

alter table public.commerce_sales_settings
    add column if not exists external_sales_url text;

alter table public.commerce_sales_settings
    drop constraint if exists commerce_sales_settings_external_sales_url_https_check;

alter table public.commerce_sales_settings
    add constraint commerce_sales_settings_external_sales_url_https_check
    check (
        external_sales_url is null
        or external_sales_url ~ '^https://[^[:space:]]+$'
    );

-- The read RPC keeps the same name so existing admin clients remain compatible;
-- older clients simply ignore the newly returned column.
drop function if exists public.admin_get_commerce_sales_settings();

create function public.admin_get_commerce_sales_settings()
returns table (
    external_sales_enabled boolean,
    access_code_enabled boolean,
    external_sales_url text,
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
        settings.external_sales_url,
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

-- Keep the existing seven-boolean update RPC for older clients and add an
-- overload that also saves the external purchase destination.
create or replace function public.admin_update_commerce_sales_settings(
    p_external_sales_enabled boolean,
    p_access_code_enabled boolean,
    p_external_sales_url text,
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
declare
    cleaned_external_sales_url text := nullif(trim(p_external_sales_url), '');
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

    if cleaned_external_sales_url is not null
       and cleaned_external_sales_url !~ '^https://[^[:space:]]+$' then
        raise exception 'external sales url must use https' using errcode = '22023';
    end if;

    update public.commerce_sales_settings
       set external_sales_enabled = p_external_sales_enabled,
           access_code_enabled = p_access_code_enabled,
           external_sales_url = cleaned_external_sales_url,
           stripe_checkout_enabled = p_stripe_checkout_enabled,
           pwa_7day_enabled = p_pwa_7day_enabled,
           pwa_monthly_enabled = p_pwa_monthly_enabled,
           windows_monthly_enabled = p_windows_monthly_enabled,
           bundle_monthly_enabled = p_bundle_monthly_enabled,
           updated_by = (select auth.uid())
     where id = 1;
end;
$function$;

revoke all on function public.admin_update_commerce_sales_settings(boolean, boolean, text, boolean, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.admin_update_commerce_sales_settings(boolean, boolean, text, boolean, boolean, boolean, boolean, boolean) to authenticated;

commit;
