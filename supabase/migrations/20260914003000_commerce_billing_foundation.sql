begin;

create table public.commerce_plans (
    plan_code text primary key,
    name text not null,
    description text not null,
    purchase_type text not null,
    platform_scope text not null,
    entitlement_product_codes text[] not null,
    duration_days integer,
    status text not null default 'active',
    sort_order integer not null default 100,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint commerce_plans_code_check
        check (plan_code = upper(plan_code) and plan_code ~ '^[A-Z0-9][A-Z0-9-]{2,63}$'),
    constraint commerce_plans_name_check
        check (length(trim(name)) between 1 and 160),
    constraint commerce_plans_description_check
        check (length(trim(description)) between 1 and 500),
    constraint commerce_plans_purchase_type_check
        check (purchase_type in ('one_time', 'subscription')),
    constraint commerce_plans_platform_scope_check
        check (platform_scope in ('pwa', 'windows', 'bundle')),
    constraint commerce_plans_products_check
        check (cardinality(entitlement_product_codes) between 1 and 4),
    constraint commerce_plans_duration_check
        check (
            (purchase_type = 'one_time' and duration_days between 1 and 365)
            or (purchase_type = 'subscription' and duration_days is null)
        ),
    constraint commerce_plans_status_check
        check (status in ('active', 'inactive', 'archived'))
);

create trigger commerce_plans_set_updated_at
before update on public.commerce_plans
for each row execute function private.set_updated_at();

insert into public.commerce_plans (
    plan_code,
    name,
    description,
    purchase_type,
    platform_scope,
    entitlement_product_codes,
    duration_days,
    sort_order
) values
    (
        'AAS-PWA-7DAY',
        'PWA 7日利用パス',
        'PWA版を7日間利用できる自動更新なしの短期利用パスです。',
        'one_time',
        'pwa',
        array['AAS-PWA-BETA']::text[],
        7,
        10
    ),
    (
        'AAS-PWA-MONTHLY',
        'PWA 月額プラン',
        'PWA版を1か月ごとの自動更新で利用する継続プランです。',
        'subscription',
        'pwa',
        array['AAS-PWA-BETA']::text[],
        null,
        20
    ),
    (
        'AAS-WIN-MONTHLY',
        'Windows 月額プラン',
        'Windows版を1か月ごとの自動更新で利用する継続プランです。',
        'subscription',
        'windows',
        array['AAS-WIN-BETA']::text[],
        null,
        30
    ),
    (
        'AAS-BUNDLE-MONTHLY',
        'PWA + Windows 月額プラン',
        'PWA版とWindows版の両方を1か月ごとの自動更新で利用するセットプランです。',
        'subscription',
        'bundle',
        array['AAS-PWA-BETA', 'AAS-WIN-BETA']::text[],
        null,
        40
    )
on conflict (plan_code) do update
set name = excluded.name,
    description = excluded.description,
    purchase_type = excluded.purchase_type,
    platform_scope = excluded.platform_scope,
    entitlement_product_codes = excluded.entitlement_product_codes,
    duration_days = excluded.duration_days,
    sort_order = excluded.sort_order,
    status = 'active';

create table public.billing_customers (
    user_id uuid primary key references public.profiles(id) on delete cascade,
    provider text not null default 'stripe',
    provider_customer_id text not null unique,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint billing_customers_provider_check check (provider = 'stripe'),
    constraint billing_customers_provider_id_check
        check (length(trim(provider_customer_id)) between 3 and 255)
);

create trigger billing_customers_set_updated_at
before update on public.billing_customers
for each row execute function private.set_updated_at();

create table public.billing_checkout_sessions (
    provider_session_id text primary key,
    user_id uuid not null references public.profiles(id) on delete cascade,
    plan_code text not null references public.commerce_plans(plan_code) on delete restrict,
    provider_customer_id text not null,
    status text not null default 'open',
    created_at timestamptz not null default now(),
    completed_at timestamptz,
    updated_at timestamptz not null default now(),

    constraint billing_checkout_session_id_check
        check (length(trim(provider_session_id)) between 3 and 255),
    constraint billing_checkout_customer_id_check
        check (length(trim(provider_customer_id)) between 3 and 255),
    constraint billing_checkout_status_check
        check (status in ('open', 'complete', 'expired'))
);

create index billing_checkout_sessions_user_created_idx
    on public.billing_checkout_sessions (user_id, created_at desc);

create trigger billing_checkout_sessions_set_updated_at
before update on public.billing_checkout_sessions
for each row execute function private.set_updated_at();

create table public.billing_subscriptions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    plan_code text not null references public.commerce_plans(plan_code) on delete restrict,
    provider text not null default 'stripe',
    provider_customer_id text not null,
    provider_subscription_id text not null unique,
    status text not null,
    cancel_at_period_end boolean not null default false,
    current_period_start timestamptz,
    current_period_end timestamptz,
    ended_at timestamptz,
    livemode boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint billing_subscriptions_provider_check check (provider = 'stripe'),
    constraint billing_subscriptions_customer_id_check
        check (length(trim(provider_customer_id)) between 3 and 255),
    constraint billing_subscriptions_subscription_id_check
        check (length(trim(provider_subscription_id)) between 3 and 255),
    constraint billing_subscriptions_status_check
        check (status in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')),
    constraint billing_subscriptions_period_check
        check (current_period_end is null or current_period_start is null or current_period_end > current_period_start)
);

create index billing_subscriptions_user_updated_idx
    on public.billing_subscriptions (user_id, updated_at desc);
create index billing_subscriptions_customer_idx
    on public.billing_subscriptions (provider_customer_id);

create trigger billing_subscriptions_set_updated_at
before update on public.billing_subscriptions
for each row execute function private.set_updated_at();

create table public.billing_events (
    provider_event_id text primary key,
    event_type text not null,
    object_id text,
    livemode boolean not null default false,
    status text not null,
    processed_at timestamptz not null default now(),

    constraint billing_events_id_check
        check (length(trim(provider_event_id)) between 3 and 255),
    constraint billing_events_type_check
        check (length(trim(event_type)) between 3 and 160),
    constraint billing_events_object_id_check
        check (object_id is null or length(trim(object_id)) between 1 and 255),
    constraint billing_events_status_check
        check (status in ('processed', 'ignored'))
);

alter table public.commerce_plans enable row level security;
alter table public.commerce_plans force row level security;
alter table public.billing_customers enable row level security;
alter table public.billing_customers force row level security;
alter table public.billing_checkout_sessions enable row level security;
alter table public.billing_checkout_sessions force row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_subscriptions force row level security;
alter table public.billing_events enable row level security;
alter table public.billing_events force row level security;

revoke all on table public.commerce_plans from public, anon, authenticated;
revoke all on table public.billing_customers from public, anon, authenticated;
revoke all on table public.billing_checkout_sessions from public, anon, authenticated;
revoke all on table public.billing_subscriptions from public, anon, authenticated;
revoke all on table public.billing_events from public, anon, authenticated;

grant select on table public.commerce_plans to anon, authenticated;
grant select on table public.billing_checkout_sessions to authenticated;
grant select on table public.billing_subscriptions to authenticated;

grant select, insert, update, delete on table public.billing_customers to service_role;
grant select, insert, update, delete on table public.billing_checkout_sessions to service_role;
grant select, insert, update, delete on table public.billing_subscriptions to service_role;
grant select, insert, update, delete on table public.billing_events to service_role;
grant select on table public.commerce_plans to service_role;

create policy commerce_plans_public_active
on public.commerce_plans
for select
to anon, authenticated
using (status = 'active');

create policy billing_checkout_sessions_select_own
on public.billing_checkout_sessions
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy billing_subscriptions_select_own
on public.billing_subscriptions
for select
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.billing_register_checkout(
    p_user_id uuid,
    p_plan_code text,
    p_provider_session_id text,
    p_provider_customer_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
    normalized_plan_code text := upper(nullif(trim(p_plan_code), ''));
    target_status text;
    target_role text;
begin
    if p_user_id is null
       or normalized_plan_code is null
       or nullif(trim(p_provider_session_id), '') is null
       or nullif(trim(p_provider_customer_id), '') is null then
        raise exception 'invalid billing checkout input' using errcode = '22023';
    end if;

    select profile.status, profile.role
    into target_status, target_role
    from public.profiles as profile
    where profile.id = p_user_id
    for update;

    if not found or target_status <> 'active' or target_role <> 'user' then
        raise exception 'active user profile required' using errcode = '42501';
    end if;

    if not exists (
        select 1
        from public.commerce_plans as plan
        where plan.plan_code = normalized_plan_code
          and plan.status = 'active'
    ) then
        raise exception 'active commerce plan not found' using errcode = 'P0002';
    end if;

    insert into public.billing_customers as customer (
        user_id,
        provider,
        provider_customer_id
    ) values (
        p_user_id,
        'stripe',
        trim(p_provider_customer_id)
    )
    on conflict (user_id) do update
    set provider_customer_id = excluded.provider_customer_id;

    insert into public.billing_checkout_sessions (
        provider_session_id,
        user_id,
        plan_code,
        provider_customer_id,
        status
    ) values (
        trim(p_provider_session_id),
        p_user_id,
        normalized_plan_code,
        trim(p_provider_customer_id),
        'open'
    )
    on conflict (provider_session_id) do nothing;
end;
$function$;

create or replace function public.billing_record_checkout_event(
    p_event_id text,
    p_event_type text,
    p_object_id text,
    p_livemode boolean,
    p_provider_session_id text,
    p_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
    inserted_event_id text;
    normalized_status text := lower(nullif(trim(p_status), ''));
begin
    if normalized_status not in ('complete', 'expired') then
        raise exception 'invalid checkout terminal status' using errcode = '22023';
    end if;

    insert into public.billing_events (
        provider_event_id,
        event_type,
        object_id,
        livemode,
        status
    ) values (
        trim(p_event_id),
        trim(p_event_type),
        nullif(trim(p_object_id), ''),
        coalesce(p_livemode, false),
        'processed'
    )
    on conflict (provider_event_id) do nothing
    returning provider_event_id into inserted_event_id;

    if inserted_event_id is null then
        return false;
    end if;

    update public.billing_checkout_sessions as checkout
    set status = normalized_status,
        completed_at = case when normalized_status = 'complete' then now() else checkout.completed_at end
    where checkout.provider_session_id = trim(p_provider_session_id);

    return true;
end;
$function$;

create or replace function public.billing_apply_pass_event(
    p_event_id text,
    p_event_type text,
    p_object_id text,
    p_livemode boolean,
    p_user_id uuid,
    p_plan_code text,
    p_provider_session_id text,
    p_provider_customer_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
    inserted_event_id text;
    normalized_plan_code text := upper(nullif(trim(p_plan_code), ''));
    plan_duration_days integer;
    plan_products text[];
    target_product_code text;
    target_product_id uuid;
    entitlement_id uuid;
    entitlement_expires_at timestamptz;
    new_expires_at timestamptz;
    target_status text;
    target_role text;
begin
    insert into public.billing_events (
        provider_event_id,
        event_type,
        object_id,
        livemode,
        status
    ) values (
        trim(p_event_id),
        trim(p_event_type),
        nullif(trim(p_object_id), ''),
        coalesce(p_livemode, false),
        'processed'
    )
    on conflict (provider_event_id) do nothing
    returning provider_event_id into inserted_event_id;

    if inserted_event_id is null then
        return false;
    end if;

    select profile.status, profile.role
    into target_status, target_role
    from public.profiles as profile
    where profile.id = p_user_id
    for update;

    if not found or target_status <> 'active' or target_role <> 'user' then
        raise exception 'active user profile required' using errcode = '42501';
    end if;

    select plan.duration_days, plan.entitlement_product_codes
    into plan_duration_days, plan_products
    from public.commerce_plans as plan
    where plan.plan_code = normalized_plan_code
      and plan.status = 'active'
      and plan.purchase_type = 'one_time';

    if not found or plan_duration_days is null then
        raise exception 'active one-time commerce plan not found' using errcode = 'P0002';
    end if;

    insert into public.billing_customers as customer (
        user_id,
        provider,
        provider_customer_id
    ) values (
        p_user_id,
        'stripe',
        trim(p_provider_customer_id)
    )
    on conflict (user_id) do update
    set provider_customer_id = excluded.provider_customer_id;

    update public.billing_checkout_sessions as checkout
    set status = 'complete',
        completed_at = coalesce(checkout.completed_at, now())
    where checkout.provider_session_id = trim(p_provider_session_id)
      and checkout.user_id = p_user_id;

    foreach target_product_code in array plan_products loop
        select product.id
        into target_product_id
        from public.products as product
        where product.product_code = target_product_code
          and product.status = 'active';

        if target_product_id is null then
            raise exception 'entitlement product not found: %', target_product_code using errcode = 'P0002';
        end if;

        entitlement_id := null;
        entitlement_expires_at := null;

        select entitlement.id, entitlement.expires_at
        into entitlement_id, entitlement_expires_at
        from public.user_entitlements as entitlement
        where entitlement.user_id = p_user_id
          and entitlement.product_id = target_product_id
          and entitlement.status = 'active'
        for update;

        if entitlement_id is null then
            new_expires_at := now() + make_interval(days => plan_duration_days);
            insert into public.user_entitlements (
                user_id,
                product_id,
                status,
                sales_channel,
                external_reference,
                granted_at,
                expires_at
            ) values (
                p_user_id,
                target_product_id,
                'active',
                'stripe-pass',
                trim(p_provider_session_id),
                now(),
                new_expires_at
            );
        elsif entitlement_expires_at is not null then
            new_expires_at := greatest(entitlement_expires_at, now()) + make_interval(days => plan_duration_days);
            update public.user_entitlements as entitlement
            set expires_at = new_expires_at,
                sales_channel = case when entitlement.sales_channel = 'stripe-pass' then 'stripe-pass' else entitlement.sales_channel end,
                external_reference = case when entitlement.sales_channel = 'stripe-pass' then trim(p_provider_session_id) else entitlement.external_reference end
            where entitlement.id = entitlement_id;
        end if;
    end loop;

    return true;
end;
$function$;

create or replace function public.billing_sync_subscription_event(
    p_event_id text,
    p_event_type text,
    p_object_id text,
    p_livemode boolean,
    p_user_id uuid,
    p_plan_code text,
    p_provider_customer_id text,
    p_provider_subscription_id text,
    p_status text,
    p_cancel_at_period_end boolean,
    p_current_period_start timestamptz,
    p_current_period_end timestamptz,
    p_ended_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
    inserted_event_id text;
    normalized_plan_code text := upper(nullif(trim(p_plan_code), ''));
    normalized_status text := lower(nullif(trim(p_status), ''));
    plan_products text[];
    target_product_code text;
    target_product_id uuid;
    entitlement_id uuid;
    entitlement_expires_at timestamptz;
    access_should_continue boolean;
    target_status text;
    target_role text;
begin
    insert into public.billing_events (
        provider_event_id,
        event_type,
        object_id,
        livemode,
        status
    ) values (
        trim(p_event_id),
        trim(p_event_type),
        nullif(trim(p_object_id), ''),
        coalesce(p_livemode, false),
        'processed'
    )
    on conflict (provider_event_id) do nothing
    returning provider_event_id into inserted_event_id;

    if inserted_event_id is null then
        return false;
    end if;

    select profile.status, profile.role
    into target_status, target_role
    from public.profiles as profile
    where profile.id = p_user_id
    for update;

    if not found or target_role <> 'user' then
        raise exception 'user profile required' using errcode = '42501';
    end if;

    select plan.entitlement_product_codes
    into plan_products
    from public.commerce_plans as plan
    where plan.plan_code = normalized_plan_code
      and plan.status = 'active'
      and plan.purchase_type = 'subscription';

    if not found then
        raise exception 'active subscription commerce plan not found' using errcode = 'P0002';
    end if;

    if normalized_status not in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused') then
        raise exception 'invalid subscription status' using errcode = '22023';
    end if;

    insert into public.billing_customers as customer (
        user_id,
        provider,
        provider_customer_id
    ) values (
        p_user_id,
        'stripe',
        trim(p_provider_customer_id)
    )
    on conflict (user_id) do update
    set provider_customer_id = excluded.provider_customer_id;

    insert into public.billing_subscriptions as subscription (
        user_id,
        plan_code,
        provider,
        provider_customer_id,
        provider_subscription_id,
        status,
        cancel_at_period_end,
        current_period_start,
        current_period_end,
        ended_at,
        livemode
    ) values (
        p_user_id,
        normalized_plan_code,
        'stripe',
        trim(p_provider_customer_id),
        trim(p_provider_subscription_id),
        normalized_status,
        coalesce(p_cancel_at_period_end, false),
        p_current_period_start,
        p_current_period_end,
        p_ended_at,
        coalesce(p_livemode, false)
    )
    on conflict (provider_subscription_id) do update
    set user_id = excluded.user_id,
        plan_code = excluded.plan_code,
        provider_customer_id = excluded.provider_customer_id,
        status = excluded.status,
        cancel_at_period_end = excluded.cancel_at_period_end,
        current_period_start = excluded.current_period_start,
        current_period_end = excluded.current_period_end,
        ended_at = excluded.ended_at,
        livemode = excluded.livemode;

    access_should_continue :=
        target_status = 'active'
        and normalized_status in ('trialing', 'active', 'past_due')
        and p_current_period_end is not null
        and p_current_period_end > now();

    if access_should_continue then
        update public.user_entitlements as entitlement
        set status = 'revoked'
        from public.products as product
        where entitlement.user_id = p_user_id
          and entitlement.product_id = product.id
          and entitlement.status = 'active'
          and entitlement.sales_channel = 'stripe-subscription'
          and entitlement.external_reference = trim(p_provider_subscription_id)
          and not (product.product_code = any(plan_products));

        foreach target_product_code in array plan_products loop
            select product.id
            into target_product_id
            from public.products as product
            where product.product_code = target_product_code
              and product.status = 'active';

            if target_product_id is null then
                raise exception 'entitlement product not found: %', target_product_code using errcode = 'P0002';
            end if;

            entitlement_id := null;
            entitlement_expires_at := null;

            select entitlement.id, entitlement.expires_at
            into entitlement_id, entitlement_expires_at
            from public.user_entitlements as entitlement
            where entitlement.user_id = p_user_id
              and entitlement.product_id = target_product_id
              and entitlement.status = 'active'
            for update;

            if entitlement_id is null then
                insert into public.user_entitlements (
                    user_id,
                    product_id,
                    status,
                    sales_channel,
                    external_reference,
                    granted_at,
                    expires_at
                ) values (
                    p_user_id,
                    target_product_id,
                    'active',
                    'stripe-subscription',
                    trim(p_provider_subscription_id),
                    now(),
                    p_current_period_end
                );
            elsif entitlement_expires_at is not null then
                update public.user_entitlements as entitlement
                set expires_at = greatest(entitlement_expires_at, p_current_period_end),
                    sales_channel = case
                        when entitlement.sales_channel = 'stripe-subscription' then 'stripe-subscription'
                        else entitlement.sales_channel
                    end,
                    external_reference = case
                        when entitlement.sales_channel = 'stripe-subscription' then trim(p_provider_subscription_id)
                        else entitlement.external_reference
                    end
                where entitlement.id = entitlement_id;
            end if;
        end loop;
    else
        update public.user_entitlements as entitlement
        set status = 'revoked'
        where entitlement.user_id = p_user_id
          and entitlement.status = 'active'
          and entitlement.sales_channel = 'stripe-subscription'
          and entitlement.external_reference = trim(p_provider_subscription_id);
    end if;

    return true;
end;
$function$;

create or replace function public.billing_record_ignored_event(
    p_event_id text,
    p_event_type text,
    p_object_id text,
    p_livemode boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
    inserted_event_id text;
begin
    insert into public.billing_events (
        provider_event_id,
        event_type,
        object_id,
        livemode,
        status
    ) values (
        trim(p_event_id),
        trim(p_event_type),
        nullif(trim(p_object_id), ''),
        coalesce(p_livemode, false),
        'ignored'
    )
    on conflict (provider_event_id) do nothing
    returning provider_event_id into inserted_event_id;

    return inserted_event_id is not null;
end;
$function$;

revoke all on function public.billing_register_checkout(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.billing_record_checkout_event(text, text, text, boolean, text, text) from public, anon, authenticated;
revoke all on function public.billing_apply_pass_event(text, text, text, boolean, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.billing_sync_subscription_event(text, text, text, boolean, uuid, text, text, text, text, boolean, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.billing_record_ignored_event(text, text, text, boolean) from public, anon, authenticated;

grant execute on function public.billing_register_checkout(uuid, text, text, text) to service_role;
grant execute on function public.billing_record_checkout_event(text, text, text, boolean, text, text) to service_role;
grant execute on function public.billing_apply_pass_event(text, text, text, boolean, uuid, text, text, text) to service_role;
grant execute on function public.billing_sync_subscription_event(text, text, text, boolean, uuid, text, text, text, text, boolean, timestamptz, timestamptz, timestamptz) to service_role;
grant execute on function public.billing_record_ignored_event(text, text, text, boolean) to service_role;

commit;
