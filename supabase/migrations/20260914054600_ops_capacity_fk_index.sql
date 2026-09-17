begin;

create index if not exists ops_capacity_settings_updated_by_idx
  on public.ops_capacity_settings(updated_by)
  where updated_by is not null;

commit;
