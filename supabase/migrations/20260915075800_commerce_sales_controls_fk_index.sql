begin;

create index if not exists commerce_sales_settings_updated_by_idx
    on public.commerce_sales_settings (updated_by)
    where updated_by is not null;

commit;
