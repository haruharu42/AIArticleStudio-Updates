-- Phase 9/10: PWA invite redemption and shared admin entitlement controls.
-- Source-only until explicitly applied to the AAS Supabase project.

begin;

create table public.pwa_invites (
    id uuid primary key default gen_random_uuid(),
    code uuid not null unique default gen_random_uuid(),
    label text,
    status text not null default 'active',
    sales_channel text not null default 'admin-invite',
    external_reference text,
    max_uses integer not null default 1,
    use_count integer not null default 0,
    expires_at timestamptz,
    entitlement_expires_at timestamptz,
    created_by uuid not null references public.profiles(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint pwa_invites_status_check
        check (status in ('active', 'exhausted', 'revoked')),
    constraint pwa_invites_label_check
        check (label is null or length(trim(label)) between 1 and 200),
    constraint pwa_invites_sales_channel_check
        check (length(trim(sales_channel)) between 1 and 100),
    constraint pwa_invites_external_reference_check
        check (
            external_reference is null
            or length(trim(external_reference)) between 1 and 255
        ),
    constraint pwa_invites_max_uses_check
        check (max_uses between 1 and 10000),
    constraint pwa_invites_use_count_check
        check (use_count between 0 and max_uses),
    constraint pwa_invites_entitlement_expiry_check
        check (
            entitlement_expires_at is null
            or entitlement_expires_at > created_at
        )
);

create trigger pwa_invites_set_updated_at
before update on public.pwa_invites
for each row execute function private.set_updated_at();

create index pwa_invites_status_created_idx
    on public.pwa_invites (status, created_at desc);

create table public.pwa_invite_redemptions (
    id uuid primary key default gen_random_uuid(),
    invite_id uuid not null references public.pwa_invites(id) on delete restrict,
    user_id uuid not null references public.profiles(id) on delete restrict,
    redeemed_at timestamptz not null default now(),
    unique (invite_id, user_id)
);

create index pwa_invite_redemptions_user_idx
    on public.pwa_invite_redemptions (user_id, redeemed_at desc);

alter table public.pwa_invites enable row level security;
alter table public.pwa_invites force row level security;
alter table public.pwa_invite_redemptions enable row level security;
alter table public.pwa_invite_redemptions force row level security;

revoke all on table public.pwa_invites from public, anon, authenticated;
revoke all on table public.pwa_invite_redemptions from public, anon, authenticated;

create or replace function public.admin_create_pwa_invite(
    p_label text default null,
    p_sales_channel text default 'admin-invite',
    p_external_reference text default null,
    p_expires_at timestamptz default null,
    p_entitlement_expires_at timestamptz default null,
    p_max_uses integer default 1
)
returns table (
    id uuid,
    invite_code text,
    label text,
    status text,
    sales_channel text,
    external_reference text,
    max_uses integer,
    use_count integer,
    expires_at timestamptz,
    entitlement_expires_at timestamptz,
    created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
    current_admin_id uuid := (select auth.uid());
    normalized_label text := nullif(trim(p_label), '');
    normalized_sales_channel text := nullif(trim(p_sales_channel), '');
    normalized_external_reference text := nullif(trim(p_external_reference), '');
    created_invite public.pwa_invites%rowtype;
begin
    if current_admin_id is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode = '42501';
    end if;

    if normalized_label is not null and length(normalized_label) > 200 then
        raise exception 'invalid invite label' using errcode = '22023';
    end if;
    if normalized_sales_channel is null or length(normalized_sales_channel) > 100 then
        raise exception 'invalid sales channel' using errcode = '22023';
    end if;
    if normalized_external_reference is not null and length(normalized_external_reference) > 255 then
        raise exception 'invalid external reference' using errcode = '22023';
    end if;
    if p_max_uses is null or p_max_uses < 1 or p_max_uses > 10000 then
        raise exception 'invalid max uses' using errcode = '22023';
    end if;
    if p_expires_at is not null and p_expires_at <= now() then
        raise exception 'invite expiry must be in the future' using errcode = '22023';
    end if;
    if p_entitlement_expires_at is not null and p_entitlement_expires_at <= now() then
        raise exception 'entitlement expiry must be in the future' using errcode = '22023';
    end if;

    insert into public.pwa_invites (
        label,
        sales_channel,
        external_reference,
        max_uses,
        expires_at,
        entitlement_expires_at,
        created_by
    ) values (
        normalized_label,
        normalized_sales_channel,
        normalized_external_reference,
        p_max_uses,
        p_expires_at,
        p_entitlement_expires_at,
        current_admin_id
    )
    returning * into created_invite;

    return query select
        created_invite.id,
        created_invite.code::text,
        created_invite.label,
        created_invite.status,
        created_invite.sales_channel,
        created_invite.external_reference,
        created_invite.max_uses,
        created_invite.use_count,
        created_invite.expires_at,
        created_invite.entitlement_expires_at,
        created_invite.created_at;
end;
$function$;

create or replace function public.admin_list_pwa_invites(
    p_status text default null
)
returns table (
    id uuid,
    invite_code text,
    label text,
    status text,
    sales_channel text,
    external_reference text,
    max_uses integer,
    use_count integer,
    expires_at timestamptz,
    entitlement_expires_at timestamptz,
    created_at timestamptz,
    updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
    normalized_status text := nullif(lower(trim(p_status)), '');
begin
    if (select auth.uid()) is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode = '42501';
    end if;

    if normalized_status is not null
       and normalized_status not in ('active', 'exhausted', 'revoked') then
        raise exception 'invalid invite status' using errcode = '22023';
    end if;

    return query
    select
        invite.id,
        invite.code::text,
        invite.label,
        invite.status,
        invite.sales_channel,
        invite.external_reference,
        invite.max_uses,
        invite.use_count,
        invite.expires_at,
        invite.entitlement_expires_at,
        invite.created_at,
        invite.updated_at
    from public.pwa_invites as invite
    where normalized_status is null or invite.status = normalized_status
    order by invite.created_at desc, invite.id;
end;
$function$;

create or replace function public.admin_revoke_pwa_invite(
    p_invite_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
    changed_id uuid;
begin
    if (select auth.uid()) is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode = '42501';
    end if;

    update public.pwa_invites
    set status = 'revoked'
    where id = p_invite_id
      and status = 'active'
    returning id into changed_id;

    if changed_id is null then
        raise exception 'active invite not found' using errcode = 'P0002';
    end if;

    return changed_id;
end;
$function$;

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
    current_role text;
    current_status text;
    parsed_code uuid;
    selected_invite public.pwa_invites%rowtype;
    pwa_product_id uuid;
    entitlement_id uuid;
begin
    if current_user_id is null then
        raise exception 'authentication required' using errcode = '42501';
    end if;

    select profile.aas_user_id, profile.role, profile.status
    into current_aas_id, current_role, current_status
    from public.profiles as profile
    where profile.id = current_user_id
    for update;

    if not found or current_role <> 'user' or current_status not in ('pending', 'active') then
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
    returning entitlement.id into entitlement_id;

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
        current_status
    from public.user_entitlements as entitlement
    where entitlement.id = entitlement_id;
end;
$function$;

create or replace function public.admin_list_user_entitlements(
    p_target_user_id uuid
)
returns table (
    id uuid,
    user_id uuid,
    product_code text,
    product_name text,
    platform text,
    status text,
    sales_channel text,
    external_reference text,
    granted_at timestamptz,
    expires_at timestamptz,
    updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
    if (select auth.uid()) is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode = '42501';
    end if;

    if not exists (
        select 1
        from public.profiles as profile
        where profile.id = p_target_user_id
    ) then
        raise exception 'target profile not found' using errcode = 'P0002';
    end if;

    return query
    select
        entitlement.id,
        entitlement.user_id,
        product.product_code,
        product.name,
        product.platform,
        entitlement.status,
        entitlement.sales_channel,
        entitlement.external_reference,
        entitlement.granted_at,
        entitlement.expires_at,
        entitlement.updated_at
    from public.user_entitlements as entitlement
    join public.products as product on product.id = entitlement.product_id
    where entitlement.user_id = p_target_user_id
    order by entitlement.created_at desc, entitlement.id;
end;
$function$;

revoke all on function public.admin_create_pwa_invite(text, text, text, timestamptz, timestamptz, integer)
from public, anon;
revoke all on function public.admin_list_pwa_invites(text)
from public, anon;
revoke all on function public.admin_revoke_pwa_invite(uuid)
from public, anon;
revoke all on function public.redeem_pwa_invite(text)
from public, anon;
revoke all on function public.admin_list_user_entitlements(uuid)
from public, anon;

grant execute on function public.admin_create_pwa_invite(text, text, text, timestamptz, timestamptz, integer)
to authenticated;
grant execute on function public.admin_list_pwa_invites(text)
to authenticated;
grant execute on function public.admin_revoke_pwa_invite(uuid)
to authenticated;
grant execute on function public.redeem_pwa_invite(text)
to authenticated;
grant execute on function public.admin_list_user_entitlements(uuid)
to authenticated;

commit;
