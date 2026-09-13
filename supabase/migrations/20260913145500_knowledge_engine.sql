begin;

create or replace function private.is_active_profile()
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
          and status = 'active'
    );
$$;

revoke all on function private.is_active_profile() from public, anon;
grant execute on function private.is_active_profile() to authenticated;

create or replace function private.normalize_knowledge_value(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
    select lower(regexp_replace(trim(normalize(coalesce(p_value, ''), NFKC)), '\s+', ' ', 'g'));
$$;

revoke all on function private.normalize_knowledge_value(text) from public, anon, authenticated;

create table if not exists public.knowledge_catalog (
    id uuid primary key default gen_random_uuid(),
    key text not null unique,
    kind text not null check (kind in ('age', 'genre', 'subgenre', 'publication', 'task', 'combination')),
    label text not null check (char_length(label) between 1 and 120),
    parent_label text,
    aliases text[] not null default '{}',
    guidance text[] not null default '{}',
    deliverables text[] not null default '{}',
    cautions text[] not null default '{}',
    tasks text[] not null default '{}',
    priority smallint not null default 50 check (priority between 0 and 100),
    status text not null default 'active' check (status in ('active', 'draft', 'disabled')),
    source text not null default 'admin' check (source in ('admin', 'candidate')),
    created_by uuid references public.profiles(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (parent_label is null or char_length(parent_label) <= 120),
    check (tasks <@ array['title','article','image','social','promotion']::text[])
);

create index if not exists knowledge_catalog_status_priority_idx
    on public.knowledge_catalog (status, priority desc, updated_at desc);
create index if not exists knowledge_catalog_kind_label_idx
    on public.knowledge_catalog (kind, label);

alter table public.knowledge_catalog enable row level security;
alter table public.knowledge_catalog force row level security;

revoke all on table public.knowledge_catalog from public, anon, authenticated;
grant select on table public.knowledge_catalog to authenticated;

drop policy if exists knowledge_catalog_select_active_or_admin on public.knowledge_catalog;
create policy knowledge_catalog_select_active_or_admin
on public.knowledge_catalog
for select
to authenticated
using (
    ((select private.is_active_profile()) and status = 'active')
    or (select private.is_active_admin())
);

create table if not exists public.knowledge_candidate_signals (
    user_id uuid not null references public.profiles(id) on delete cascade,
    kind text not null check (kind in ('genre', 'subgenre')),
    parent_value text not null default '',
    parent_normalized text not null default '',
    value_original text not null check (char_length(value_original) between 1 and 120),
    value_normalized text not null check (char_length(value_normalized) between 1 and 120),
    use_count integer not null default 1 check (use_count > 0),
    first_seen_at timestamptz not null default now(),
    last_seen_at timestamptz not null default now(),
    primary key (user_id, kind, parent_normalized, value_normalized)
);

create index if not exists knowledge_candidate_signals_aggregate_idx
    on public.knowledge_candidate_signals (kind, parent_normalized, value_normalized, last_seen_at desc);

alter table public.knowledge_candidate_signals enable row level security;
alter table public.knowledge_candidate_signals force row level security;
revoke all on table public.knowledge_candidate_signals from public, anon, authenticated;

create table if not exists public.knowledge_candidate_decisions (
    kind text not null check (kind in ('genre', 'subgenre')),
    parent_normalized text not null default '',
    value_normalized text not null,
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    canonical_label text,
    notes text,
    catalog_key text,
    reviewed_by uuid references public.profiles(id),
    reviewed_at timestamptz,
    updated_at timestamptz not null default now(),
    primary key (kind, parent_normalized, value_normalized),
    check (canonical_label is null or char_length(canonical_label) <= 120),
    check (notes is null or char_length(notes) <= 1000)
);

create index if not exists knowledge_candidate_decisions_status_idx
    on public.knowledge_candidate_decisions (status, updated_at desc);

alter table public.knowledge_candidate_decisions enable row level security;
alter table public.knowledge_candidate_decisions force row level security;
revoke all on table public.knowledge_candidate_decisions from public, anon, authenticated;

create or replace function public.record_knowledge_candidate(
    p_kind text,
    p_parent_value text,
    p_value text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    current_user_id uuid := (select auth.uid());
    clean_kind text := lower(trim(coalesce(p_kind, '')));
    clean_parent text := left(trim(normalize(coalesce(p_parent_value, ''), NFKC)), 120);
    clean_value text := left(trim(normalize(coalesce(p_value, ''), NFKC)), 120);
    parent_norm text;
    value_norm text;
begin
    if current_user_id is null or not (select private.is_active_profile()) then
        raise exception 'active authenticated user required' using errcode = '42501';
    end if;
    if clean_kind not in ('genre', 'subgenre') then
        raise exception 'invalid knowledge candidate kind' using errcode = '22023';
    end if;
    if clean_value = '' or clean_value in ('その他', 'AIおまかせ') then
        return;
    end if;

    parent_norm := (select private.normalize_knowledge_value(clean_parent));
    value_norm := (select private.normalize_knowledge_value(clean_value));
    if value_norm = '' then return; end if;

    insert into public.knowledge_candidate_signals (
        user_id, kind, parent_value, parent_normalized, value_original, value_normalized,
        use_count, first_seen_at, last_seen_at
    ) values (
        current_user_id, clean_kind, clean_parent, parent_norm, clean_value, value_norm,
        1, now(), now()
    )
    on conflict (user_id, kind, parent_normalized, value_normalized)
    do update set
        parent_value = excluded.parent_value,
        value_original = excluded.value_original,
        use_count = public.knowledge_candidate_signals.use_count + 1,
        last_seen_at = now();
end;
$$;

revoke all on function public.record_knowledge_candidate(text, text, text) from public, anon;
grant execute on function public.record_knowledge_candidate(text, text, text) to authenticated;

create or replace function public.admin_list_knowledge_candidates(p_status text default null)
returns table (
    kind text,
    parent_value text,
    value text,
    total_uses bigint,
    distinct_users bigint,
    first_seen_at timestamptz,
    last_seen_at timestamptz,
    decision_status text,
    canonical_label text,
    notes text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    if (select auth.uid()) is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode = '42501';
    end if;
    if p_status is not null and p_status not in ('pending', 'approved', 'rejected') then
        raise exception 'invalid status filter' using errcode = '22023';
    end if;

    return query
    select
        s.kind,
        min(s.parent_value) as parent_value,
        min(s.value_original) as value,
        sum(s.use_count)::bigint as total_uses,
        count(distinct s.user_id)::bigint as distinct_users,
        min(s.first_seen_at) as first_seen_at,
        max(s.last_seen_at) as last_seen_at,
        coalesce(d.status, 'pending') as decision_status,
        coalesce(d.canonical_label, '') as canonical_label,
        coalesce(d.notes, '') as notes
    from public.knowledge_candidate_signals s
    left join public.knowledge_candidate_decisions d
      on d.kind = s.kind
     and d.parent_normalized = s.parent_normalized
     and d.value_normalized = s.value_normalized
    where p_status is null or coalesce(d.status, 'pending') = p_status
    group by s.kind, s.parent_normalized, s.value_normalized, d.status, d.canonical_label, d.notes
    order by
        case coalesce(d.status, 'pending') when 'pending' then 1 when 'approved' then 2 else 3 end,
        sum(s.use_count) desc,
        max(s.last_seen_at) desc;
end;
$$;

revoke all on function public.admin_list_knowledge_candidates(text) from public, anon;
grant execute on function public.admin_list_knowledge_candidates(text) to authenticated;

create or replace function public.admin_review_knowledge_candidate(
    p_kind text,
    p_parent_value text,
    p_value text,
    p_decision text,
    p_canonical_label text default '',
    p_guidance text[] default '{}',
    p_deliverables text[] default '{}',
    p_cautions text[] default '{}',
    p_tasks text[] default '{}',
    p_priority integer default 70,
    p_notes text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
    admin_id uuid := (select auth.uid());
    clean_kind text := lower(trim(coalesce(p_kind, '')));
    clean_parent text := left(trim(normalize(coalesce(p_parent_value, ''), NFKC)), 120);
    clean_value text := left(trim(normalize(coalesce(p_value, ''), NFKC)), 120);
    clean_label text := left(trim(normalize(coalesce(p_canonical_label, ''), NFKC)), 120);
    parent_norm text;
    value_norm text;
    next_key text;
begin
    if admin_id is null or not (select private.is_active_admin()) then
        raise exception 'active admin required' using errcode = '42501';
    end if;
    if clean_kind not in ('genre', 'subgenre') then
        raise exception 'invalid knowledge candidate kind' using errcode = '22023';
    end if;
    if p_decision not in ('pending', 'approved', 'rejected') then
        raise exception 'invalid decision' using errcode = '22023';
    end if;
    if clean_value = '' then
        raise exception 'candidate value required' using errcode = '22023';
    end if;
    if p_priority < 0 or p_priority > 100 then
        raise exception 'priority out of range' using errcode = '22023';
    end if;
    if not (coalesce(p_tasks, '{}') <@ array['title','article','image','social','promotion']::text[]) then
        raise exception 'invalid knowledge tasks' using errcode = '22023';
    end if;

    parent_norm := (select private.normalize_knowledge_value(clean_parent));
    value_norm := (select private.normalize_knowledge_value(clean_value));
    next_key := 'candidate:' || clean_kind || ':' || md5(parent_norm || '|' || value_norm);

    if p_decision = 'approved' and clean_label = '' then
        clean_label := clean_value;
    end if;

    insert into public.knowledge_candidate_decisions (
        kind, parent_normalized, value_normalized, status, canonical_label, notes,
        catalog_key, reviewed_by, reviewed_at, updated_at
    ) values (
        clean_kind, parent_norm, value_norm, p_decision,
        nullif(clean_label, ''), nullif(left(trim(coalesce(p_notes, '')), 1000), ''),
        case when p_decision = 'approved' then next_key else null end,
        admin_id, now(), now()
    )
    on conflict (kind, parent_normalized, value_normalized)
    do update set
        status = excluded.status,
        canonical_label = excluded.canonical_label,
        notes = excluded.notes,
        catalog_key = excluded.catalog_key,
        reviewed_by = excluded.reviewed_by,
        reviewed_at = excluded.reviewed_at,
        updated_at = now();

    if p_decision = 'approved' then
        insert into public.knowledge_catalog (
            key, kind, label, parent_label, aliases, guidance, deliverables, cautions,
            tasks, priority, status, source, created_by, updated_at
        ) values (
            next_key, clean_kind, clean_label, nullif(clean_parent, ''), array[clean_value],
            coalesce(p_guidance, '{}'), coalesce(p_deliverables, '{}'), coalesce(p_cautions, '{}'),
            coalesce(p_tasks, '{}'), p_priority, 'active', 'candidate', admin_id, now()
        )
        on conflict (key) do update set
            label = excluded.label,
            parent_label = excluded.parent_label,
            aliases = excluded.aliases,
            guidance = excluded.guidance,
            deliverables = excluded.deliverables,
            cautions = excluded.cautions,
            tasks = excluded.tasks,
            priority = excluded.priority,
            status = 'active',
            updated_at = now();
    elsif p_decision = 'rejected' then
        update public.knowledge_catalog
        set status = 'disabled', updated_at = now()
        where key = next_key;
    end if;
end;
$$;

revoke all on function public.admin_review_knowledge_candidate(text,text,text,text,text,text[],text[],text[],text[],integer,text) from public, anon;
grant execute on function public.admin_review_knowledge_candidate(text,text,text,text,text,text[],text[],text[],text[],integer,text) to authenticated;

commit;
