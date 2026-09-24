-- Enforce the per-user article preset cap in the database.
-- The UI already blocks preset 31, but the database must remain authoritative
-- under concurrent inserts or direct Data API calls.

create or replace function private.enforce_article_preset_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
    preset_count integer;
begin
    -- Serialize inserts for the same owner so concurrent requests cannot both
    -- observe 29 rows and create rows 30 and 31 at the same time.
    perform 1
    from public.profiles
    where id = new.user_id
    for update;

    select count(*)::integer
    into preset_count
    from public.article_presets
    where user_id = new.user_id;

    if preset_count >= 30 then
        raise exception 'article preset limit reached'
            using errcode = '23514';
    end if;

    return new;
end;
$function$;

revoke all on function private.enforce_article_preset_limit()
from public, anon, authenticated;

drop trigger if exists article_presets_limit_30
on public.article_presets;

create trigger article_presets_limit_30
before insert on public.article_presets
for each row
execute function private.enforce_article_preset_limit();
