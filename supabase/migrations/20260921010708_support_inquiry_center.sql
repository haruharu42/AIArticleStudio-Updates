create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('feature_request','bug','how_to','account_access','billing','other')),
  subject text,
  status text not null default 'new' check (status in ('new','reviewing','waiting_user','resolved','closed')),
  priority text not null default 'normal' check (priority in ('normal','high','urgent')),
  admin_seen_at timestamptz,
  user_seen_at timestamptz,
  last_user_message_at timestamptz not null default now(),
  last_admin_message_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_requests_subject_length check (subject is null or char_length(subject) <= 120)
);

create table if not exists public.support_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.support_requests(id) on delete cascade,
  sender_user_id uuid not null references public.profiles(id) on delete restrict,
  sender_role text not null check (sender_role in ('user','admin')),
  body text not null,
  created_at timestamptz not null default now(),
  constraint support_request_messages_body_length check (char_length(body) between 1 and 5000)
);

create index if not exists support_requests_user_created_idx on public.support_requests(user_id, created_at desc);
create index if not exists support_requests_status_updated_idx on public.support_requests(status, updated_at desc);
create index if not exists support_requests_admin_unread_idx on public.support_requests(last_user_message_at desc) where status <> 'closed';
create index if not exists support_request_messages_request_created_idx on public.support_request_messages(request_id, created_at asc);
create index if not exists support_request_messages_sender_idx on public.support_request_messages(sender_user_id);

alter table public.support_requests enable row level security;
alter table public.support_requests force row level security;
alter table public.support_request_messages enable row level security;
alter table public.support_request_messages force row level security;

drop policy if exists support_requests_select_owner_or_admin on public.support_requests;
create policy support_requests_select_owner_or_admin on public.support_requests for select to authenticated
using (((user_id = (select auth.uid())) and (select private.is_active_profile())) or (select private.is_active_admin()));

drop policy if exists support_messages_select_owner_or_admin on public.support_request_messages;
create policy support_messages_select_owner_or_admin on public.support_request_messages for select to authenticated
using (
  exists (
    select 1 from public.support_requests r
    where r.id = request_id
      and (((r.user_id = (select auth.uid())) and (select private.is_active_profile())) or (select private.is_active_admin()))
  )
);

revoke all on table public.support_requests from public, anon, authenticated;
revoke all on table public.support_request_messages from public, anon, authenticated;
grant select on table public.support_requests to authenticated;
grant select on table public.support_request_messages to authenticated;

create or replace function private.touch_support_request_updated_at()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;
revoke all on function private.touch_support_request_updated_at() from public, anon, authenticated;

drop trigger if exists support_requests_touch_updated_at on public.support_requests;
create trigger support_requests_touch_updated_at before update on public.support_requests
for each row execute function private.touch_support_request_updated_at();

create or replace function public.create_support_request(p_category text, p_subject text, p_message text)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_request_id uuid;
  v_message text := btrim(coalesce(p_message, ''));
  v_subject text := nullif(btrim(coalesce(p_subject, '')), '');
  v_recent_count bigint;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if not private.is_active_profile() then raise exception 'active profile required'; end if;
  if p_category not in ('feature_request','bug','how_to','account_access','billing','other') then raise exception 'invalid support category'; end if;
  if char_length(v_message) < 5 or char_length(v_message) > 5000 then raise exception 'support message must be between 5 and 5000 characters'; end if;
  if v_subject is not null and char_length(v_subject) > 120 then raise exception 'support subject is too long'; end if;

  select count(*) into v_recent_count
  from public.support_requests
  where user_id = v_uid and created_at >= now() - interval '24 hours';
  if v_recent_count >= 10 then raise exception 'support request daily limit exceeded'; end if;

  insert into public.support_requests(user_id, category, subject, status, priority, user_seen_at, last_user_message_at)
  values (v_uid, p_category, v_subject, 'new', 'normal', now(), now())
  returning id into v_request_id;

  insert into public.support_request_messages(request_id, sender_user_id, sender_role, body)
  values (v_request_id, v_uid, 'user', v_message);

  return v_request_id;
end;
$function$;

create or replace function public.reply_support_request(p_request_id uuid, p_message text)
returns void language plpgsql security definer set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_status text;
  v_is_admin boolean;
  v_message text := btrim(coalesce(p_message, ''));
  v_recent_count bigint;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if char_length(v_message) < 1 or char_length(v_message) > 5000 then raise exception 'support reply must be between 1 and 5000 characters'; end if;

  v_is_admin := private.is_active_admin();
  select user_id, status into v_owner, v_status
  from public.support_requests where id = p_request_id for update;
  if v_owner is null then raise exception 'support request not found'; end if;

  if not v_is_admin then
    if v_owner <> v_uid or not private.is_active_profile() then raise exception 'support request access denied'; end if;
    if v_status = 'closed' then raise exception 'closed support request cannot be replied to'; end if;

    select count(*) into v_recent_count
    from public.support_request_messages
    where sender_user_id = v_uid and sender_role = 'user' and created_at >= now() - interval '24 hours';
    if v_recent_count >= 30 then raise exception 'support message daily limit exceeded'; end if;
  end if;

  insert into public.support_request_messages(request_id, sender_user_id, sender_role, body)
  values (p_request_id, v_uid, case when v_is_admin then 'admin' else 'user' end, v_message);

  if v_is_admin then
    update public.support_requests
    set last_admin_message_at = now(), status = case when status = 'closed' then status else 'waiting_user' end
    where id = p_request_id;
  else
    update public.support_requests
    set last_user_message_at = now(), admin_seen_at = null,
        status = case when status in ('waiting_user','resolved') then 'new' else status end,
        resolved_at = case when status in ('waiting_user','resolved') then null else resolved_at end
    where id = p_request_id;
  end if;
end;
$function$;

create or replace function public.mark_support_request_seen(p_request_id uuid)
returns void language plpgsql security definer set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  select user_id into v_owner from public.support_requests where id = p_request_id;
  if v_owner is null then raise exception 'support request not found'; end if;

  if private.is_active_admin() then
    update public.support_requests set admin_seen_at = now() where id = p_request_id;
  elsif v_owner = v_uid and private.is_active_profile() then
    update public.support_requests set user_seen_at = now() where id = p_request_id;
  else
    raise exception 'support request access denied';
  end if;
end;
$function$;

create or replace function public.close_own_support_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not private.is_active_profile() then raise exception 'active profile required'; end if;
  update public.support_requests
  set status = 'closed', resolved_at = coalesce(resolved_at, now()), user_seen_at = now()
  where id = p_request_id and user_id = v_uid;
  if not found then raise exception 'support request not found'; end if;
end;
$function$;

create or replace function public.admin_set_support_request(p_request_id uuid, p_status text, p_priority text)
returns void language plpgsql security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or not private.is_active_admin() then raise exception 'active admin required'; end if;
  if p_status not in ('new','reviewing','waiting_user','resolved','closed') then raise exception 'invalid support status'; end if;
  if p_priority not in ('normal','high','urgent') then raise exception 'invalid support priority'; end if;

  update public.support_requests
  set status = p_status, priority = p_priority, admin_seen_at = now(),
      resolved_at = case when p_status in ('resolved','closed') then coalesce(resolved_at, now()) else null end
  where id = p_request_id;
  if not found then raise exception 'support request not found'; end if;
end;
$function$;

create or replace function public.get_support_notification_summary()
returns table(unread_count bigint, open_count bigint)
language plpgsql security definer set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then return query select 0::bigint, 0::bigint; return; end if;

  if private.is_active_admin() then
    return query
    select
      count(*) filter (where r.last_user_message_at > coalesce(r.admin_seen_at, '-infinity'::timestamptz) and r.status <> 'closed')::bigint,
      count(*) filter (where r.status not in ('resolved','closed'))::bigint
    from public.support_requests r;
  elsif private.is_active_profile() then
    return query
    select
      count(*) filter (where r.last_admin_message_at is not null and r.last_admin_message_at > coalesce(r.user_seen_at, '-infinity'::timestamptz))::bigint,
      count(*) filter (where r.status not in ('resolved','closed'))::bigint
    from public.support_requests r
    where r.user_id = v_uid;
  else
    return query select 0::bigint, 0::bigint;
  end if;
end;
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

comment on table public.support_requests is 'Owner-scoped AAS support tickets with admin workflow state and unread timestamps.';
comment on table public.support_request_messages is 'Immutable support conversation messages. Do not store passwords, auth codes, payment card data, tokens, or other secrets.';
