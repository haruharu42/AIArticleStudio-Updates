-- Development-only policy: keep the administrator boundary limited to active admin
-- accounts, but temporarily do not require an AAL2 MFA-backed session.
-- Re-enable the AAL2 condition before public production launch.
create or replace function private.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select exists (
        select 1
        from public.profiles
        where id = (select auth.uid())
          and role = 'admin'
          and status = 'active'
    );
$$;

comment on function private.is_active_admin() is
'Temporary development policy: active admin profile required; AAL2 MFA enforcement is paused until public release readiness.';
