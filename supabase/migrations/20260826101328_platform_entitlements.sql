-- RECONSTRUCTED RECOVERY COPY
-- Rebuilt from the applied Supabase schema/RLS/RPC definitions and Phase 1 records.
-- This is intended to restore the missing local migration artifact; it is not claimed
-- to be byte-identical to the original local file.
begin;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
    new.updated_at := now();
    return new;
end;
$function$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create or replace function private.is_active_profile()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
    select exists (
        select 1
        from public.profiles as profile
        where profile.id = (select auth.uid())
          and profile.status = 'active'
    );
$function$;

revoke all on function private.is_active_profile() from public, anon;
grant execute on function private.is_active_profile() to authenticated;

create table public.products (
    id uuid primary key default gen_random_uuid(),
    product_code text not null unique,
    name text not null,
    platform text not null,
    status text not null default 'active',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint products_code_format_check
        check (
            product_code = upper(product_code)
            and product_code ~ '^[A-Z0-9][A-Z0-9-]{2,63}$'
        ),
    constraint products_name_check
        check (length(trim(name)) between 1 and 200),
    constraint products_platform_check
        check (platform in ('windows', 'pwa')),
    constraint products_status_check
        check (status in ('active', 'inactive', 'archived'))
);

create trigger products_set_updated_at
before update on public.products
for each row execute function private.set_updated_at();

alter table public.products enable row level security;
alter table public.products force row level security;

revoke all on table public.products from public, anon, authenticated;
grant select on table public.products to authenticated;

create policy products_select_active_or_admin
on public.products
for select
to authenticated
using (
    status = 'active'
    or (select private.is_active_admin())
);

insert into public.products (product_code, name, platform, status)
values
    ('AAS-WIN-BETA', 'AI Article Studio Windows Beta', 'windows', 'active'),
    ('AAS-PWA-BETA', 'AI Article Studio PWA Beta', 'pwa', 'active')
on conflict (product_code) do update
set name = excluded.name,
    platform = excluded.platform,
    status = excluded.status;

create table public.user_entitlements (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    product_id uuid not null references public.products(id) on delete restrict,
    status text not null default 'active',
    sales_channel text not null,
    external_reference text,
    granted_at timestamptz not null default now(),
    expires_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint user_entitlements_status_check
        check (status in ('active', 'expired', 'revoked')),
    constraint user_entitlements_sales_channel_check
        check (length(trim(sales_channel)) between 1 and 100),
    constraint user_entitlements_external_reference_check
        check (
            external_reference is null
            or length(trim(external_reference)) between 1 and 255
        ),
    constraint user_entitlements_expiry_check
        check (expires_at is null or expires_at > granted_at)
);

create unique index user_entitlements_one_active_product_idx
    on public.user_entitlements (user_id, product_id)
    where status = 'active';

create index user_entitlements_product_status_idx
    on public.user_entitlements (product_id, status);

create index user_entitlements_user_created_idx
    on public.user_entitlements (user_id, created_at desc);

create trigger user_entitlements_set_updated_at
before update on public.user_entitlements
for each row execute function private.set_updated_at();

alter table public.user_entitlements enable row level security;
alter table public.user_entitlements force row level security;

revoke all on table public.user_entitlements from public, anon, authenticated;
grant select on table public.user_entitlements to authenticated;

create policy user_entitlements_select_own
on public.user_entitlements
for select
to authenticated
using (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
);

create or replace function public.can_access_product(p_product_code text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    requested_product_code text := upper(nullif(trim(p_product_code), ''));
begin
    if current_user_id is null or requested_product_code is null then
        return false;
    end if;

    return exists (
        select 1
        from public.profiles as profile
        join public.products as product
          on product.product_code = requested_product_code
         and product.status = 'active'
        where profile.id = current_user_id
          and profile.status = 'active'
          and (
              profile.role = 'admin'
              or (
                  profile.role = 'user'
                  and exists (
                      select 1
                      from public.user_entitlements as entitlement
                      where entitlement.user_id = profile.id
                        and entitlement.product_id = product.id
                        and entitlement.status = 'active'
                        and (
                            entitlement.expires_at is null
                            or entitlement.expires_at > now()
                        )
                  )
              )
          )
    );
end;
$function$;

revoke all on function public.can_access_product(text) from public, anon;
grant execute on function public.can_access_product(text) to authenticated;

create or replace function public.admin_grant_entitlement(
    p_target_user_id uuid,
    p_product_code text,
    p_expires_at timestamptz default null,
    p_sales_channel text default 'admin',
    p_external_reference text default null
)
returns table (
    id uuid,
    user_id uuid,
    product_code text,
    status text,
    sales_channel text,
    external_reference text,
    granted_at timestamptz,
    expires_at timestamptz,
    created_at timestamptz,
    updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
    requested_product_code text := upper(nullif(trim(p_product_code), ''));
    normalized_sales_channel text := nullif(trim(p_sales_channel), '');
    normalized_external_reference text := nullif(trim(p_external_reference), '');
    target_role text;
    target_product_id uuid;
    target_entitlement_id uuid;
    grant_time timestamptz := now();
begin
    if (select auth.uid()) is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode = '42501';
    end if;

    if requested_product_code is null then
        raise exception 'product code is required' using errcode = '22023';
    end if;

    if normalized_sales_channel is null or length(normalized_sales_channel) > 100 then
        raise exception 'invalid sales channel' using errcode = '22023';
    end if;

    if normalized_external_reference is not null
       and length(normalized_external_reference) > 255 then
        raise exception 'invalid external reference' using errcode = '22023';
    end if;

    if p_expires_at is not null and p_expires_at <= grant_time then
        raise exception 'expiry must be in the future' using errcode = '22023';
    end if;

    select profile.role
    into target_role
    from public.profiles as profile
    where profile.id = p_target_user_id;

    if not found then
        raise exception 'target profile not found' using errcode = 'P0002';
    end if;

    if target_role <> 'user' then
        raise exception 'entitlements can only be granted to users' using errcode = '22023';
    end if;

    select product.id
    into target_product_id
    from public.products as product
    where product.product_code = requested_product_code
      and product.status = 'active';

    if not found then
        raise exception 'active product not found' using errcode = 'P0002';
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
        p_target_user_id,
        target_product_id,
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
        expires_at = excluded.expires_at
    returning entitlement.id into target_entitlement_id;

    return query
    select
        entitlement.id,
        entitlement.user_id,
        product.product_code,
        entitlement.status,
        entitlement.sales_channel,
        entitlement.external_reference,
        entitlement.granted_at,
        entitlement.expires_at,
        entitlement.created_at,
        entitlement.updated_at
    from public.user_entitlements as entitlement
    join public.products as product on product.id = entitlement.product_id
    where entitlement.id = target_entitlement_id;
end;
$function$;

revoke all on function public.admin_grant_entitlement(uuid, text, timestamptz, text, text)
from public, anon;
grant execute on function public.admin_grant_entitlement(uuid, text, timestamptz, text, text)
to authenticated;

create or replace function public.admin_revoke_entitlement(
    p_target_user_id uuid,
    p_product_code text
)
returns table (
    id uuid,
    user_id uuid,
    product_code text,
    status text,
    sales_channel text,
    external_reference text,
    granted_at timestamptz,
    expires_at timestamptz,
    created_at timestamptz,
    updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
    requested_product_code text := upper(nullif(trim(p_product_code), ''));
    target_role text;
    target_product_id uuid;
    target_entitlement_id uuid;
begin
    if (select auth.uid()) is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode = '42501';
    end if;

    select profile.role
    into target_role
    from public.profiles as profile
    where profile.id = p_target_user_id;

    if not found then
        raise exception 'target profile not found' using errcode = 'P0002';
    end if;

    if target_role <> 'user' then
        raise exception 'entitlements can only be revoked from users' using errcode = '22023';
    end if;

    select product.id
    into target_product_id
    from public.products as product
    where product.product_code = requested_product_code;

    if not found then
        raise exception 'product not found' using errcode = 'P0002';
    end if;

    select entitlement.id
    into target_entitlement_id
    from public.user_entitlements as entitlement
    where entitlement.user_id = p_target_user_id
      and entitlement.product_id = target_product_id
      and entitlement.status = 'active'
    for update;

    if not found then
        raise exception 'active entitlement not found' using errcode = '22023';
    end if;

    update public.user_entitlements as entitlement
    set status = 'revoked'
    where entitlement.id = target_entitlement_id;

    return query
    select
        entitlement.id,
        entitlement.user_id,
        product.product_code,
        entitlement.status,
        entitlement.sales_channel,
        entitlement.external_reference,
        entitlement.granted_at,
        entitlement.expires_at,
        entitlement.created_at,
        entitlement.updated_at
    from public.user_entitlements as entitlement
    join public.products as product on product.id = entitlement.product_id
    where entitlement.id = target_entitlement_id;
end;
$function$;

revoke all on function public.admin_revoke_entitlement(uuid, text)
from public, anon;
grant execute on function public.admin_revoke_entitlement(uuid, text)
to authenticated;

commit;
