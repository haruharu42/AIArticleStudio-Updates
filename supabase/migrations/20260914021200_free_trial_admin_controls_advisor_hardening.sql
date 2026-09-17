begin;

create policy free_trial_settings_deny_direct
on public.free_trial_settings
for all
to anon, authenticated
using (false)
with check (false);

create policy user_free_trials_deny_direct
on public.user_free_trials
for all
to anon, authenticated
using (false)
with check (false);

create policy free_trial_daily_usage_deny_direct
on public.free_trial_daily_usage
for all
to anon, authenticated
using (false)
with check (false);

create index free_trial_settings_updated_by_idx
on public.free_trial_settings (updated_by)
where updated_by is not null;

create index user_free_trials_stopped_by_idx
on public.user_free_trials (stopped_by)
where stopped_by is not null;

commit;
