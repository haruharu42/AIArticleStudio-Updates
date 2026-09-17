begin;

-- Billing checkout verifies the authenticated browser user first, then needs only
-- the authorization fields required to decide whether checkout may proceed.
-- Keep service_role access to profiles column-scoped rather than granting full
-- table SELECT, and do not expose display_name, AAS ID, or legal-consent fields.
revoke select on table public.profiles from service_role;
grant select (id, role, status) on table public.profiles to service_role;

commit;
