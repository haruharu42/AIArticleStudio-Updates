begin;

-- A Stripe Checkout Session is the immutable purchase intent created by AAS.
-- Only its lifecycle fields (status/completed_at/updated_at) may change later.
create or replace function private.guard_billing_checkout_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
    if old.provider_session_id is distinct from new.provider_session_id
       or old.user_id is distinct from new.user_id
       or old.plan_code is distinct from new.plan_code
       or old.provider_customer_id is distinct from new.provider_customer_id then
        raise exception 'billing checkout identity is immutable' using errcode = '23514';
    end if;
    return new;
end;
$function$;

revoke all on function private.guard_billing_checkout_identity() from public, anon, authenticated;

drop trigger if exists billing_checkout_sessions_guard_identity on public.billing_checkout_sessions;
create trigger billing_checkout_sessions_guard_identity
before update on public.billing_checkout_sessions
for each row execute function private.guard_billing_checkout_identity();

commit;
