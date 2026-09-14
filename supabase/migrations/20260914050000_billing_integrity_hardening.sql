begin;

-- Billing identities are intentionally immutable once they have been bound.
-- This prevents a later webhook, retry, or operator-side metadata edit from
-- reassigning one Stripe customer/subscription to another AAS user or plan.
create or replace function private.guard_billing_customer_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
    if old.user_id is distinct from new.user_id
       or old.provider is distinct from new.provider
       or old.provider_customer_id is distinct from new.provider_customer_id then
        raise exception 'billing customer identity is immutable' using errcode = '23514';
    end if;
    return new;
end;
$function$;

revoke all on function private.guard_billing_customer_identity() from public, anon, authenticated;

drop trigger if exists billing_customers_guard_identity on public.billing_customers;
create trigger billing_customers_guard_identity
before update on public.billing_customers
for each row execute function private.guard_billing_customer_identity();

create or replace function private.guard_billing_subscription_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
    if tg_op = 'INSERT' then
        if not exists (
            select 1
            from public.billing_customers as customer
            where customer.user_id = new.user_id
              and customer.provider = 'stripe'
              and customer.provider_customer_id = new.provider_customer_id
        ) then
            raise exception 'registered billing customer required' using errcode = '23514';
        end if;

        if not exists (
            select 1
            from public.billing_checkout_sessions as checkout
            where checkout.user_id = new.user_id
              and checkout.plan_code = new.plan_code
              and checkout.provider_customer_id = new.provider_customer_id
              and checkout.status in ('open', 'complete')
              and checkout.created_at >= now() - interval '24 hours'
        ) then
            raise exception 'recent registered checkout required for new subscription' using errcode = '23514';
        end if;
    elsif old.user_id is distinct from new.user_id
       or old.plan_code is distinct from new.plan_code
       or old.provider is distinct from new.provider
       or old.provider_customer_id is distinct from new.provider_customer_id
       or old.provider_subscription_id is distinct from new.provider_subscription_id
       or old.livemode is distinct from new.livemode then
        raise exception 'billing subscription identity is immutable' using errcode = '23514';
    end if;

    return new;
end;
$function$;

revoke all on function private.guard_billing_subscription_identity() from public, anon, authenticated;

drop trigger if exists billing_subscriptions_guard_identity on public.billing_subscriptions;
create trigger billing_subscriptions_guard_identity
before insert or update on public.billing_subscriptions
for each row execute function private.guard_billing_subscription_identity();

-- Checkout terminal events from unrelated Stripe sessions are recorded as
-- ignored instead of looking processed even though no AAS checkout was bound.
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
    normalized_session_id text := nullif(trim(p_provider_session_id), '');
begin
    if normalized_status not in ('complete', 'expired') then
        raise exception 'invalid checkout terminal status' using errcode = '22023';
    end if;

    if normalized_session_id is null
       or not exists (
           select 1
           from public.billing_checkout_sessions as checkout
           where checkout.provider_session_id = normalized_session_id
       ) then
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
        completed_at = case when normalized_status = 'complete' then coalesce(checkout.completed_at, now()) else checkout.completed_at end
    where checkout.provider_session_id = normalized_session_id;

    return true;
end;
$function$;

revoke all on function public.billing_record_checkout_event(text, text, text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.billing_record_checkout_event(text, text, text, boolean, text, text) to service_role;

-- A one-time pass may only grant/extend access when the exact Checkout Session
-- was registered by AAS for the same user, plan, and Stripe customer first.
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
    normalized_session_id text := nullif(trim(p_provider_session_id), '');
    normalized_customer_id text := nullif(trim(p_provider_customer_id), '');
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
    if p_user_id is null
       or normalized_plan_code is null
       or normalized_session_id is null
       or normalized_customer_id is null then
        raise exception 'invalid pass event input' using errcode = '22023';
    end if;

    if not exists (
        select 1
        from public.billing_checkout_sessions as checkout
        where checkout.provider_session_id = normalized_session_id
          and checkout.user_id = p_user_id
          and checkout.plan_code = normalized_plan_code
          and checkout.provider_customer_id = normalized_customer_id
          and checkout.status in ('open', 'complete')
    ) or not exists (
        select 1
        from public.billing_customers as customer
        where customer.user_id = p_user_id
          and customer.provider = 'stripe'
          and customer.provider_customer_id = normalized_customer_id
    ) then
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
    set status = 'complete',
        completed_at = coalesce(checkout.completed_at, now())
    where checkout.provider_session_id = normalized_session_id
      and checkout.user_id = p_user_id
      and checkout.plan_code = normalized_plan_code
      and checkout.provider_customer_id = normalized_customer_id;

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
                normalized_session_id,
                now(),
                new_expires_at
            );
        elsif entitlement_expires_at is not null then
            new_expires_at := greatest(entitlement_expires_at, now()) + make_interval(days => plan_duration_days);
            update public.user_entitlements as entitlement
            set expires_at = new_expires_at,
                sales_channel = case when entitlement.sales_channel = 'stripe-pass' then 'stripe-pass' else entitlement.sales_channel end,
                external_reference = case when entitlement.sales_channel = 'stripe-pass' then normalized_session_id else entitlement.external_reference end
            where entitlement.id = entitlement_id;
        end if;
    end loop;

    return true;
end;
$function$;

revoke all on function public.billing_apply_pass_event(text, text, text, boolean, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.billing_apply_pass_event(text, text, text, boolean, uuid, text, text, text) to service_role;

commit;
