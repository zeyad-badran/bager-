-- Read-only checks for migration 20261120100000. Safe to run any time; changes nothing.
-- Every row must show ok = t. Any f means the migration did not apply as intended.

select 'schema private exists' as check_name,
       exists (select 1 from pg_namespace where nspname = 'private') as ok
union all
select 'private schema is closed to anon',
       not has_schema_privilege('anon', 'private', 'usage')
union all
select 'staff_role has exactly owner, manager, cashier, kitchen, auditor (in that order)',
       (select array_agg(enumlabel::text order by enumsortorder)
          from pg_enum e join pg_type t on t.oid = e.enumtypid
         where t.typname = 'staff_role')
       = array['owner','manager','cashier','kitchen','auditor']
union all
select 'function private.set_updated_at exists',
       to_regprocedure('private.set_updated_at()') is not null;
