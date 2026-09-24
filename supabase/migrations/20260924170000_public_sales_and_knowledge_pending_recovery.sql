-- Production recovery hardening:
-- 1) expose only safe commerce sales toggles through an anon/authenticated RPC
-- 2) release stale pending Knowledge refresh requests so scheduler queues cannot block forever

create or replace function public.get_public_commerce_sales_settings()
returns table (
  external_sales_enabled boolean,
  access_code_enabled boolean,
  external_sales_url text,
  stripe_checkout_enabled boolean,
  pwa_7day_enabled boolean,
  pwa_monthly_enabled boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    settings.external_sales_enabled,
    settings.access_code_enabled,
    settings.external_sales_url,
    settings.stripe_checkout_enabled,
    settings.pwa_7day_enabled,
    settings.pwa_monthly_enabled,
    settings.updated_at
  from public.commerce_sales_settings as settings
  where settings.id = 1
$function$;

revoke all on function public.get_public_commerce_sales_settings() from public;
grant execute on function public.get_public_commerce_sales_settings() to anon, authenticated;

create or replace function private.enqueue_due_knowledge_refreshes()
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  update public.knowledge_refresh_requests
  set
    status = 'failed',
    completed_at = now(),
    error_message = coalesce(
      nullif(error_message, ''),
      'AAS auto-recovery: pending exceeded 24 hours; request was released for the next refresh cycle.'
    )
  where status = 'pending'
    and requested_at <= now() - interval '24 hours';

  update public.knowledge_refresh_requests
  set
    status = 'failed',
    completed_at = now(),
    error_message = coalesce(
      nullif(error_message, ''),
      'AAS auto-recovery: processing exceeded 24 hours; request was released for the next refresh cycle.'
    )
  where status = 'processing'
    and started_at is not null
    and started_at <= now() - interval '24 hours';

  insert into public.knowledge_refresh_requests (channel)
  select channel.channel
  from public.knowledge_refresh_channels as channel
  where channel.next_refresh_due_at <= now()
    and not exists (
      select 1
      from public.knowledge_refresh_requests as request
      where request.channel = channel.channel
        and request.status in ('pending', 'processing')
    )
  on conflict do nothing;

  update public.knowledge_refresh_channels as channel
  set
    last_refresh_requested_at = now(),
    next_refresh_due_at = now() + make_interval(hours => channel.refresh_hours),
    updated_at = now()
  where channel.next_refresh_due_at <= now()
    and exists (
      select 1
      from public.knowledge_refresh_requests as request
      where request.channel = channel.channel
        and request.status in ('pending', 'processing')
    );
end;
$function$;

revoke all on function private.enqueue_due_knowledge_refreshes() from public, anon, authenticated;
