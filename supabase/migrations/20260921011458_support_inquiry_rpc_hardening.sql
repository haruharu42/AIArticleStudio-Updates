alter function public.create_support_request(text,text,text) set schema private;
alter function public.reply_support_request(uuid,text) set schema private;
alter function public.mark_support_request_seen(uuid) set schema private;
alter function public.close_own_support_request(uuid) set schema private;
alter function public.admin_set_support_request(uuid,text,text) set schema private;
alter function public.get_support_notification_summary() set schema private;

revoke all on function private.create_support_request(text,text,text) from public, anon;
revoke all on function private.reply_support_request(uuid,text) from public, anon;
revoke all on function private.mark_support_request_seen(uuid) from public, anon;
revoke all on function private.close_own_support_request(uuid) from public, anon;
revoke all on function private.admin_set_support_request(uuid,text,text) from public, anon;
revoke all on function private.get_support_notification_summary() from public, anon;

grant execute on function private.create_support_request(text,text,text) to authenticated;
grant execute on function private.reply_support_request(uuid,text) to authenticated;
grant execute on function private.mark_support_request_seen(uuid) to authenticated;
grant execute on function private.close_own_support_request(uuid) to authenticated;
grant execute on function private.admin_set_support_request(uuid,text,text) to authenticated;
grant execute on function private.get_support_notification_summary() to authenticated;

create function public.create_support_request(p_category text, p_subject text, p_message text)
returns uuid language sql security invoker set search_path = ''
as $function$
  select private.create_support_request($1,$2,$3);
$function$;

create function public.reply_support_request(p_request_id uuid, p_message text)
returns void language sql security invoker set search_path = ''
as $function$
  select private.reply_support_request($1,$2);
$function$;

create function public.mark_support_request_seen(p_request_id uuid)
returns void language sql security invoker set search_path = ''
as $function$
  select private.mark_support_request_seen($1);
$function$;

create function public.close_own_support_request(p_request_id uuid)
returns void language sql security invoker set search_path = ''
as $function$
  select private.close_own_support_request($1);
$function$;

create function public.admin_set_support_request(p_request_id uuid, p_status text, p_priority text)
returns void language sql security invoker set search_path = ''
as $function$
  select private.admin_set_support_request($1,$2,$3);
$function$;

create function public.get_support_notification_summary()
returns table(unread_count bigint, open_count bigint)
language sql security invoker set search_path = ''
as $function$
  select * from private.get_support_notification_summary();
$function$;

revoke all on function public.create_support_request(text,text,text) from public, anon;
revoke all on function public.reply_support_request(uuid,text) from public, anon;
revoke all on function public.mark_support_request_seen(uuid) from public, anon;
revoke all on function public.close_own_support_request(uuid) from public, anon;
revoke all on function public.admin_set_support_request(uuid,text,text) from public, anon;
revoke all on function public.get_support_notification_summary() from public, anon;

grant execute on function public.create_support_request(text,text,text) to authenticated;
grant execute on function public.reply_support_request(uuid,text) to authenticated;
grant execute on function public.mark_support_request_seen(uuid) to authenticated;
grant execute on function public.close_own_support_request(uuid) to authenticated;
grant execute on function public.admin_set_support_request(uuid,text,text) to authenticated;
grant execute on function public.get_support_notification_summary() to authenticated;
