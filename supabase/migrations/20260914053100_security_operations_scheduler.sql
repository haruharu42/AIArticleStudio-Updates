begin;

create extension if not exists pg_cron with schema pg_catalog;

do $block$
declare
    existing_job bigint;
begin
    select jobid into existing_job from cron.job where jobname='aas-ops-security-audit-hourly' limit 1;
    if existing_job is not null then
        perform cron.unschedule(existing_job);
    end if;
end;
$block$;

select cron.schedule(
    'aas-ops-security-audit-hourly',
    '0 * * * *',
    $cron$select private.ops_run_database_audit('scheduled');$cron$
);

select private.ops_run_database_audit('installation');

commit;
