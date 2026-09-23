-- Side-hustle Knowledge / Prompt task expansion v1
-- Extends the existing review-gated Fresh/Stable knowledge pipeline without changing authorization.

alter table public.knowledge_catalog
  drop constraint if exists knowledge_catalog_tasks_check;

alter table public.knowledge_catalog
  add constraint knowledge_catalog_tasks_check
  check (tasks <@ array['title','article','image','social','promotion','sidejob_content','sidejob_sns','sidejob_video','sidejob_affiliate','sidejob_resale','sidejob_crowdsourcing','sidejob_skill_sales','sidejob_digital_product','sidejob_outreach','sidejob_research','sidejob_efficiency','sidejob_planning']::text[]);

alter table public.prompt_optimization_catalog
  drop constraint if exists prompt_optimization_catalog_task_check;

alter table public.prompt_optimization_catalog
  add constraint prompt_optimization_catalog_task_check
  check (task = any (array['all','title','article','image','social','promotion','sidejob_content','sidejob_sns','sidejob_video','sidejob_affiliate','sidejob_resale','sidejob_crowdsourcing','sidejob_skill_sales','sidejob_digital_product','sidejob_outreach','sidejob_research','sidejob_efficiency','sidejob_planning']::text[]));

do $migration$
declare
  ddl text;
  original text;
begin
  ddl := pg_get_functiondef('public.admin_publish_knowledge_refresh_bundle(bigint,jsonb)'::regprocedure);
  original := ddl;
  ddl := replace(
    ddl,
    'private.aas_json_text_array(item -> ''tasks'', 5, 32)',
    'private.aas_json_text_array(item -> ''tasks'', 20, 32)'
  );
  ddl := replace(
    ddl,
    'array[''title'',''article'',''image'',''social'',''promotion'']::text[]',
    'array[''title'',''article'',''image'',''social'',''promotion'',''sidejob_content'',''sidejob_sns'',''sidejob_video'',''sidejob_affiliate'',''sidejob_resale'',''sidejob_crowdsourcing'',''sidejob_skill_sales'',''sidejob_digital_product'',''sidejob_outreach'',''sidejob_research'',''sidejob_efficiency'',''sidejob_planning'']::text[]'
  );
  ddl := replace(
    ddl,
    'clean_task not in (''all'', ''title'', ''article'', ''image'', ''social'', ''promotion'')',
    'clean_task not in (''all'', ''title'', ''article'', ''image'', ''social'', ''promotion'', ''sidejob_content'', ''sidejob_sns'', ''sidejob_video'', ''sidejob_affiliate'', ''sidejob_resale'', ''sidejob_crowdsourcing'', ''sidejob_skill_sales'', ''sidejob_digital_product'', ''sidejob_outreach'', ''sidejob_research'', ''sidejob_efficiency'', ''sidejob_planning'')'
  );
  if ddl = original then
    raise exception 'admin_publish_knowledge_refresh_bundle task contract was not updated';
  end if;
  execute ddl;

  ddl := pg_get_functiondef('public.admin_review_knowledge_candidate(text,text,text,text,text,text[],text[],text[],text[],integer,text)'::regprocedure);
  original := ddl;
  ddl := replace(
    ddl,
    'array[''title'',''article'',''image'',''social'',''promotion'']::text[]',
    'array[''title'',''article'',''image'',''social'',''promotion'',''sidejob_content'',''sidejob_sns'',''sidejob_video'',''sidejob_affiliate'',''sidejob_resale'',''sidejob_crowdsourcing'',''sidejob_skill_sales'',''sidejob_digital_product'',''sidejob_outreach'',''sidejob_research'',''sidejob_efficiency'',''sidejob_planning'']::text[]'
  );
  if ddl = original then
    raise exception 'admin_review_knowledge_candidate task contract was not updated';
  end if;
  execute ddl;

  ddl := pg_get_functiondef('private.aas_knowledge_refresh_diff(jsonb)'::regprocedure);
  original := ddl;
  ddl := replace(
    ddl,
    'private.aas_json_text_array(item -> ''tasks'', 5, 32)',
    'private.aas_json_text_array(item -> ''tasks'', 20, 32)'
  );
  if ddl = original then
    raise exception 'aas_knowledge_refresh_diff task limit was not updated';
  end if;
  execute ddl;
end
$migration$;
