-- Read-only checks for migration 20261120100500. Every row must show ok = t.

with expected(tablename, policy_count) as (
  values ('restaurants', 2), ('branches', 4), ('branch_settings', 2),
         ('profiles', 2), ('memberships', 4), ('audit_logs', 1)
)
select 'policy count per table matches the design (' || e.tablename || ')' as check_name,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = e.tablename) = e.policy_count as ok
from expected e
union all
select 'every policy is limited to signed-in users (no policy for anon or public)',
       (select count(*) from pg_policies
         where schemaname = 'public'
           and tablename in ('restaurants','branches','branch_settings','profiles','memberships','audit_logs')
           and roles <> array['authenticated']::name[]) = 0
union all
select 'anonymous visitors have no privilege on any tenant table',
       (select count(*)
          from unnest(array['restaurants','branches','branch_settings','profiles','memberships','audit_logs']) t(name)
         where has_table_privilege('anon', 'public.' || t.name, 'select,insert,update,delete')) = 0
union all
select 'signed-in users cannot insert restaurants or audit_logs directly',
       not has_table_privilege('authenticated', 'public.restaurants', 'insert')
       and not has_table_privilege('authenticated', 'public.audit_logs', 'insert')
union all
select 'a branch cannot be moved to another restaurant (restaurant_id is not updatable)',
       not has_column_privilege('authenticated', 'public.branches', 'restaurant_id', 'update')
       and has_column_privilege('authenticated', 'public.branches', 'name', 'update')
union all
select 'audit_logs can only be read, never changed, by signed-in users',
       has_table_privilege('authenticated', 'public.audit_logs', 'select')
       and not has_table_privilege('authenticated', 'public.audit_logs', 'update')
       and not has_table_privilege('authenticated', 'public.audit_logs', 'delete');
