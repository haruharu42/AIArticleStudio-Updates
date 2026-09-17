revoke create on schema public from public;
revoke create on schema public from anon, authenticated;

-- Existing SECURITY DEFINER RPCs must never be anonymously or implicitly callable.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon', f.fn);
  end loop;
end
$$;

-- Future objects are private by default. Any browser-facing access must be explicitly granted.
alter default privileges for role postgres in schema public revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from public, anon, authenticated;

-- Keep the existing automatic RLS event trigger, but also FORCE RLS on future public tables.
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table','partitioned table')
  loop
    if cmd.schema_name = 'public' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        execute format('alter table if exists %s force row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled and forced RLS on %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable/force RLS on %', cmd.object_identity;
      end;
    else
      raise log 'rls_auto_enable: skip % (schema: %)', cmd.object_identity, cmd.schema_name;
    end if;
  end loop;
end;
$function$;

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
