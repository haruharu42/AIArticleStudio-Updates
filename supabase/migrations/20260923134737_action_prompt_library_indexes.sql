create index if not exists action_prompt_categories_created_by_idx
  on public.action_prompt_categories(created_by);
create index if not exists action_prompt_categories_updated_by_idx
  on public.action_prompt_categories(updated_by);
create index if not exists action_prompt_templates_category_key_idx
  on public.action_prompt_templates(category_key);
create index if not exists action_prompt_templates_created_by_idx
  on public.action_prompt_templates(created_by);
create index if not exists action_prompt_templates_updated_by_idx
  on public.action_prompt_templates(updated_by);
create index if not exists action_prompt_templates_active_sort_idx
  on public.action_prompt_templates(status, category_key, sort_order, title);
