-- Phase 5A fix: return optimistic revision conflicts through the Data API
-- without triggering transaction-rollback retries for SQLSTATE 40001.
--
-- The existing public.update_article RPC keeps its SQLSTATE 40001 contract.
-- This workspace wrapper locks the owned article row, checks the expected
-- revision atomically, and returns a PostgREST custom HTTP 409 response whose
-- public error code remains "40001".

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
    current_revision integer;
    updated_article public.articles%rowtype;
    updated_workspace public.article_workspaces%rowtype;
begin
    if current_user_id is null or not (select private.is_active_profile()) then
        raise exception 'active profile required' using errcode = '42501';
    end if;

    if p_expected_revision is null or p_expected_revision < 1 then
        raise exception 'expected revision is required' using errcode = '22023';
    end if;

    if jsonb_typeof(article_patch) <> 'object' then
        raise exception 'article patch must be an object' using errcode = '22023';
    end if;

    select article.title, article.revision
    into current_title, current_revision
    from public.articles as article
    where article.id = p_article_id
      and article.user_id = current_user_id
    for update;

    if not found then
        raise exception 'article not found' using errcode = 'P0002';
    end if;

    if current_revision <> p_expected_revision then
        raise sqlstate 'PGRST' using
            message = jsonb_build_object(
                'code', '40001',
                'message', 'article revision conflict',
                'details', null,
                'hint', null
            )::text,
            detail = jsonb_build_object('status', 409)::text;
    end if;

    -- A workspace-only edit must still advance articles.revision. Reuse the
    -- existing update RPC with a safe no-op title patch.
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

revoke all on function public.update_article_with_workspace(uuid, integer, jsonb, jsonb)
from public, anon;
grant execute on function public.update_article_with_workspace(uuid, integer, jsonb, jsonb)
to authenticated;
