-- Phase 5A: shared article workspace and atomic article/workspace RPCs.
--
-- articles.body remains the current editable/completed body. This table stores
-- only non-binary editor state required to reconstruct the Windows workspace.

begin;

create table public.article_workspaces (
    article_id uuid primary key,
    user_id uuid not null,
    workspace_version integer not null default 1,
    request_json jsonb not null default '{}'::jsonb,
    workspace_json jsonb not null default '{}'::jsonb,
    image_plan_json jsonb not null default '{}'::jsonb,
    source_body text,
    publish_body text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint article_workspaces_article_owner_fkey
        foreign key (article_id, user_id)
        references public.articles (id, user_id)
        on delete cascade,
    constraint article_workspaces_version_check
        check (workspace_version >= 1),
    constraint article_workspaces_request_object_check
        check (jsonb_typeof(request_json) = 'object'),
    constraint article_workspaces_workspace_object_check
        check (jsonb_typeof(workspace_json) = 'object'),
    constraint article_workspaces_image_plan_object_check
        check (jsonb_typeof(image_plan_json) = 'object')
);

create index article_workspaces_user_updated_idx
    on public.article_workspaces (user_id, updated_at desc, article_id);

comment on table public.article_workspaces is
    'Non-binary editor state paired one-to-one with a shared article.';
comment on column public.article_workspaces.request_json is
    'Windows/PWA article input conditions used for full re-edit.';
comment on column public.article_workspaces.workspace_json is
    'Non-binary ArticleRecord reconstruction metadata. Never store image bytes or Base64.';
comment on column public.article_workspaces.image_plan_json is
    'Image planning settings and prompts only. Actual image objects use article_assets and Storage.';

alter table public.article_workspaces enable row level security;
alter table public.article_workspaces force row level security;

revoke all on table public.article_workspaces
from public, anon, authenticated;
grant select on table public.article_workspaces to authenticated;

create policy article_workspaces_select_own_active
on public.article_workspaces
for select
to authenticated
using (
    (select auth.uid()) is not null
    and user_id = (select auth.uid())
    and (select private.is_active_profile())
);

create or replace function private.validate_article_workspace_payload(
    p_workspace jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
    workspace_payload jsonb := coalesce(p_workspace, '{}'::jsonb);
    object_value jsonb;
begin
    if jsonb_typeof(workspace_payload) <> 'object' then
        raise exception 'workspace payload must be an object' using errcode = '22023';
    end if;

    if exists (
        select 1
        from jsonb_object_keys(workspace_payload) as supplied(key)
        where not supplied.key = any (array[
            'request_json', 'workspace_json', 'image_plan_json',
            'source_body', 'publish_body'
        ])
    ) then
        raise exception 'workspace payload contains unsupported fields' using errcode = '22023';
    end if;

    foreach object_value in array array[
        workspace_payload -> 'request_json',
        workspace_payload -> 'workspace_json',
        workspace_payload -> 'image_plan_json'
    ]
    loop
        if object_value is not null
           and object_value <> 'null'::jsonb
           and jsonb_typeof(object_value) <> 'object' then
            raise exception 'workspace JSON fields must be objects' using errcode = '22023';
        end if;
    end loop;

    -- Image bodies belong in private Storage, never in workspace JSON.
    if lower(coalesce(workspace_payload -> 'request_json', '{}'::jsonb)::text) like '%data:image/%'
       or lower(coalesce(workspace_payload -> 'workspace_json', '{}'::jsonb)::text) like '%data:image/%'
       or lower(coalesce(workspace_payload -> 'image_plan_json', '{}'::jsonb)::text) like '%data:image/%'
    then
        raise exception using errcode = '22023', message = 'workspace_image_binary_forbidden';
    end if;

    return workspace_payload;
end;
$function$;

revoke all on function private.validate_article_workspace_payload(jsonb)
from public, anon, authenticated;

create or replace function public.create_article_with_workspace(
    p_article jsonb default '{}'::jsonb,
    p_workspace jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
    workspace_payload jsonb := private.validate_article_workspace_payload(p_workspace);
    created_article public.articles%rowtype;
    created_workspace public.article_workspaces%rowtype;
begin
    -- create_article remains the single source for active-profile, quota,
    -- ownership, normalization, and article validation logic.
    created_article := public.create_article(coalesce(p_article, '{}'::jsonb));

    insert into public.article_workspaces (
        article_id,
        user_id,
        request_json,
        workspace_json,
        image_plan_json,
        source_body,
        publish_body
    ) values (
        created_article.id,
        created_article.user_id,
        case
            when workspace_payload -> 'request_json' is null
              or workspace_payload -> 'request_json' = 'null'::jsonb
            then '{}'::jsonb
            else workspace_payload -> 'request_json'
        end,
        case
            when workspace_payload -> 'workspace_json' is null
              or workspace_payload -> 'workspace_json' = 'null'::jsonb
            then '{}'::jsonb
            else workspace_payload -> 'workspace_json'
        end,
        case
            when workspace_payload -> 'image_plan_json' is null
              or workspace_payload -> 'image_plan_json' = 'null'::jsonb
            then '{}'::jsonb
            else workspace_payload -> 'image_plan_json'
        end,
        case
            when workspace_payload ? 'source_body'
            then workspace_payload ->> 'source_body'
            else null
        end,
        case
            when workspace_payload ? 'publish_body'
            then workspace_payload ->> 'publish_body'
            else null
        end
    )
    returning * into created_workspace;

    return jsonb_build_object(
        'article', to_jsonb(created_article),
        'workspace', to_jsonb(created_workspace)
    );
end;
$function$;

create or replace function public.update_article_with_workspace(
    p_article_id uuid,
    p_expected_revision integer,
    p_patch jsonb default '{}'::jsonb,
    p_workspace_patch jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    article_patch jsonb := coalesce(p_patch, '{}'::jsonb);
    workspace_patch jsonb := private.validate_article_workspace_payload(p_workspace_patch);
    current_title text;
    updated_article public.articles%rowtype;
    updated_workspace public.article_workspaces%rowtype;
begin
    if current_user_id is null or not (select private.is_active_profile()) then
        raise exception 'active profile required' using errcode = '42501';
    end if;

    if jsonb_typeof(article_patch) <> 'object' then
        raise exception 'article patch must be an object' using errcode = '22023';
    end if;

    select article.title
    into current_title
    from public.articles as article
    where article.id = p_article_id
      and article.user_id = current_user_id;

    if not found then
        raise exception 'article not found' using errcode = 'P0002';
    end if;

    -- A workspace-only edit must still advance articles.revision. Reuse the
    -- existing update RPC with a safe no-op title patch instead of duplicating
    -- its validation and optimistic-concurrency implementation.
    if article_patch = '{}'::jsonb then
        article_patch := jsonb_build_object('title', current_title);
    end if;

    updated_article := public.update_article(
        p_article_id,
        p_expected_revision,
        article_patch
    );

    insert into public.article_workspaces (
        article_id,
        user_id,
        request_json,
        workspace_json,
        image_plan_json,
        source_body,
        publish_body
    ) values (
        updated_article.id,
        updated_article.user_id,
        case
            when workspace_patch -> 'request_json' is null
              or workspace_patch -> 'request_json' = 'null'::jsonb
            then '{}'::jsonb
            else workspace_patch -> 'request_json'
        end,
        case
            when workspace_patch -> 'workspace_json' is null
              or workspace_patch -> 'workspace_json' = 'null'::jsonb
            then '{}'::jsonb
            else workspace_patch -> 'workspace_json'
        end,
        case
            when workspace_patch -> 'image_plan_json' is null
              or workspace_patch -> 'image_plan_json' = 'null'::jsonb
            then '{}'::jsonb
            else workspace_patch -> 'image_plan_json'
        end,
        case
            when workspace_patch ? 'source_body'
            then workspace_patch ->> 'source_body'
            else null
        end,
        case
            when workspace_patch ? 'publish_body'
            then workspace_patch ->> 'publish_body'
            else null
        end
    )
    on conflict (article_id) do update
    set request_json = case
            when workspace_patch ? 'request_json'
            then case
                when workspace_patch -> 'request_json' = 'null'::jsonb
                then '{}'::jsonb
                else workspace_patch -> 'request_json'
            end
            else public.article_workspaces.request_json
        end,
        workspace_json = case
            when workspace_patch ? 'workspace_json'
            then case
                when workspace_patch -> 'workspace_json' = 'null'::jsonb
                then '{}'::jsonb
                else workspace_patch -> 'workspace_json'
            end
            else public.article_workspaces.workspace_json
        end,
        image_plan_json = case
            when workspace_patch ? 'image_plan_json'
            then case
                when workspace_patch -> 'image_plan_json' = 'null'::jsonb
                then '{}'::jsonb
                else workspace_patch -> 'image_plan_json'
            end
            else public.article_workspaces.image_plan_json
        end,
        source_body = case
            when workspace_patch ? 'source_body'
            then workspace_patch ->> 'source_body'
            else public.article_workspaces.source_body
        end,
        publish_body = case
            when workspace_patch ? 'publish_body'
            then workspace_patch ->> 'publish_body'
            else public.article_workspaces.publish_body
        end,
        workspace_version = public.article_workspaces.workspace_version + 1,
        updated_at = now()
    where public.article_workspaces.user_id = updated_article.user_id
    returning * into updated_workspace;

    if updated_workspace.article_id is null then
        raise exception 'article workspace owner mismatch' using errcode = '42501';
    end if;

    return jsonb_build_object(
        'article', to_jsonb(updated_article),
        'workspace', to_jsonb(updated_workspace)
    );
end;
$function$;

create or replace function public.get_article_workspace(
    p_article_id uuid
)
returns public.article_workspaces
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
    current_user_id uuid := (select auth.uid());
    selected_workspace public.article_workspaces%rowtype;
begin
    if current_user_id is null or not (select private.is_active_profile()) then
        raise exception 'active profile required' using errcode = '42501';
    end if;

    select workspace.*
    into selected_workspace
    from public.article_workspaces as workspace
    where workspace.article_id = p_article_id
      and workspace.user_id = current_user_id;

    if not found then
        raise exception 'article workspace not found' using errcode = 'P0002';
    end if;

    return selected_workspace;
end;
$function$;

revoke all on function public.create_article_with_workspace(jsonb, jsonb)
from public, anon;
revoke all on function public.update_article_with_workspace(uuid, integer, jsonb, jsonb)
from public, anon;
revoke all on function public.get_article_workspace(uuid)
from public, anon;

grant execute on function public.create_article_with_workspace(jsonb, jsonb)
to authenticated;
grant execute on function public.update_article_with_workspace(uuid, integer, jsonb, jsonb)
to authenticated;
grant execute on function public.get_article_workspace(uuid)
to authenticated;

commit;
