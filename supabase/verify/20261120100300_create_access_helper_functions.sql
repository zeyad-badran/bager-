-- Read-only checks for migration 20261120100300. Every row must show ok = t.

with helpers(signature) as (
  values ('private.is_restaurant_member(uuid)'),
         ('private.has_restaurant_role(uuid, public.staff_role[])'),
         ('private.can_access_branch(uuid, uuid)'),
         ('private.has_branch_role(uuid, uuid, public.staff_role[])')
)
select 'all four helper functions exist' as check_name,
       (select count(*) from helpers where to_regprocedure(signature) is not null) = 4 as ok
union all
select 'all four are SECURITY DEFINER',
       (select count(*) from helpers h
         join pg_proc p on p.oid = to_regprocedure(h.signature)
        where p.prosecdef) = 4
union all
select 'all four pin search_path to empty (cannot be hijacked)',
       (select count(*) from helpers h
         join pg_proc p on p.oid = to_regprocedure(h.signature)
        where p.proconfig @> array['search_path=""']) = 4
union all
select 'anonymous visitors cannot run any helper',
       (select count(*) from helpers h
         where has_function_privilege('anon', to_regprocedure(h.signature), 'execute')) = 0
union all
select 'signed-in users can run every helper',
       (select count(*) from helpers h
         where has_function_privilege('authenticated', to_regprocedure(h.signature), 'execute')) = 4;
