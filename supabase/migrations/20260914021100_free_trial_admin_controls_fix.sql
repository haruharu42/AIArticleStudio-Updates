begin;

create or replace function private.free_trial_usage_date()
returns date
language sql
stable
security definer
set search_path = ''
as $function$
    select (
        (now() at time zone settings.reset_timezone)
        - make_interval(hours => settings.reset_hour)
    )::date
    from public.free_trial_settings as settings
    where settings.id = 1;
$function$;

revoke all on function private.free_trial_usage_date() from public, anon, authenticated;

create or replace function private.auto_start_free_trial_on_profile_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
    if new.status = 'active' and new.role = 'user' then
        if tg_op = 'INSERT' then
            perform private.start_free_trial_if_eligible(new.id, false, null);
        elsif old.status is distinct from new.status or old.role is distinct from new.role then
            perform private.start_free_trial_if_eligible(new.id, false, null);
        end if;
    end if;
    return new;
end;
$function$;

revoke all on function private.auto_start_free_trial_on_profile_activation() from public, anon, authenticated;

commit;
