-- RECONSTRUCTED RECOVERY COPY
-- Restores the applied Phase 1 follow-up RPC definition.
-- The final database definition is authoritative.
begin;

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

commit;
