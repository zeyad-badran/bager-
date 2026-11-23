-- Read-only checks for migration 20261124100100. Every row must show ok = t.

select 'create_manual_order refuses inactive branches with PT422 ''branch is inactive''' as check_name,
       exists (select 1 from pg_proc
                where oid = to_regprocedure('public.create_manual_order(uuid, text)')
                  and prosrc like '%is_active%'
                  and prosrc like '%branch is inactive%'
                  and prosrc like '%PT422%') as ok
union all
select 'create_manual_order is still SECURITY DEFINER with a pinned search_path',
       exists (select 1 from pg_proc
                where oid = to_regprocedure('public.create_manual_order(uuid, text)')
                  and prosecdef and proconfig @> array['search_path=""'])
union all
select 'grants unchanged: signed-in users can call create_manual_order, anonymous visitors cannot',
       has_function_privilege('authenticated', 'public.create_manual_order(uuid, text)', 'execute')
       and not has_function_privilege('anon', 'public.create_manual_order(uuid, text)', 'execute')
union all
select 'transition_order has no inactive-branch check (existing orders never get stuck)',
       (select prosrc not like '%is_active%' from pg_proc
         where oid = to_regprocedure('public.transition_order(uuid, integer, public.order_status)'));
