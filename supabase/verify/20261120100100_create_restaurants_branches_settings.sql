-- Read-only checks for migration 20261120100100. Every row must show ok = t.

select 'tables restaurants, branches, branch_settings exist' as check_name,
       (select count(*) from pg_tables
         where schemaname = 'public'
           and tablename in ('restaurants','branches','branch_settings')) = 3 as ok
union all
select 'row level security is enabled on all three',
       (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname in ('restaurants','branches','branch_settings')
           and c.relrowsecurity) = 3
union all
select 'branches has the (id, restaurant_id) unique key used by composite foreign keys',
       exists (select 1 from pg_constraint where conname = 'branches_id_restaurant_unique')
union all
select 'branch_settings is tied to its branch AND restaurant (composite foreign key)',
       exists (select 1 from pg_constraint where conname = 'branch_settings_branch_fkey' and contype = 'f')
union all
select 'time zone validation trigger is attached to branches',
       exists (select 1 from pg_trigger where tgname = 'branches_assert_valid_time_zone' and not tgisinternal)
union all
select 'default branch_settings trigger is attached to branches',
       exists (select 1 from pg_trigger where tgname = 'branches_create_default_settings' and not tgisinternal)
union all
select 'updated_at triggers exist on all three tables',
       (select count(*) from pg_trigger
         where tgname in ('restaurants_set_updated_at','branches_set_updated_at','branch_settings_set_updated_at')
           and not tgisinternal) = 3;
