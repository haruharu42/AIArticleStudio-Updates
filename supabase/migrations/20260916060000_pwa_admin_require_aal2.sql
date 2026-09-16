create or replace function private.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select
        coalesce((select auth.jwt()->>'aal'), 'aal1') = 'aal2'
        and exists (
            select 1
            from public.profiles
            where id = (select auth.uid())
              and role = 'admin'
              and status = 'active'
        );
$$;

comment on function private.is_active_admin() is
'PWA admin authorization boundary: requires an active admin profile and an AAL2 MFA-backed session.';
