-- Read-only checks for migration 20261123100000. Every row must show ok = t.

select 'order_status enum has exactly the five lifecycle states in order' as check_name,
       (select array_agg(e.enumlabel::text order by e.enumsortorder)
          from pg_enum e where e.enumtypid = 'public.order_status'::regtype)
       = array['new','preparing','ready','collected','cancelled'] as ok
union all
select 'order_source enum has only manual (POS sources arrive with FR-05)',
       (select array_agg(e.enumlabel::text order by e.enumsortorder)
          from pg_enum e where e.enumtypid = 'public.order_source'::regtype)
       = array['manual']
union all
select 'orders table exists with row level security enabled',
       coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.orders')), false)
union all
select 'ticket numbers are NOT unique (they repeat across restaurants and are reused, AT-02)',
       not exists (select 1 from pg_index i
                     join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any (i.indkey)
                    where i.indrelid = 'public.orders'::regclass and i.indisunique
                      and a.attname = 'ticket_number')
union all
select 'provider order identity is unique per branch (AT-01): orders_branch_provider_external_unique',
       exists (select 1 from pg_indexes
                where schemaname = 'public' and tablename = 'orders'
                  and indexname = 'orders_branch_provider_external_unique'
                  and indexdef ilike '%unique%(branch_id, provider, external_id)%where%')
union all
select 'orders carry restaurant_id + branch_id with a composite FK to branches',
       exists (select 1 from pg_constraint
                where conrelid = 'public.orders'::regclass and conname = 'orders_branch_fkey' and contype = 'f')
union all
select 'version defaults to 1 and must be positive',
       exists (select 1 from pg_constraint
                where conrelid = 'public.orders'::regclass and conname = 'orders_version_positive')
       and (select column_default from information_schema.columns
             where table_schema = 'public' and table_name = 'orders' and column_name = 'version') = '1'
union all
select 'audit and updated_at triggers are attached to orders (FR-14)',
       (select count(*) from pg_trigger
         where tgrelid = 'public.orders'::regclass and not tgisinternal
           and tgname in ('orders_audit', 'orders_set_updated_at')) = 2;
