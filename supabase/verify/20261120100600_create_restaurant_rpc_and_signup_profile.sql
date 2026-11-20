-- Read-only checks for migration 20261120100600. Every row must show ok = t.

select 'create_restaurant(text) exists and is SECURITY DEFINER with a pinned search_path' as check_name,
       exists (select 1 from pg_proc
                where oid = to_regprocedure('public.create_restaurant(text)')
                  and prosecdef
                  and proconfig @> array['search_path=""']) as ok
union all
select 'signed-in users can call create_restaurant, anonymous visitors cannot',
       has_function_privilege('authenticated', 'public.create_restaurant(text)', 'execute')
       and not has_function_privilege('anon', 'public.create_restaurant(text)', 'execute')
union all
select 'sign-up trigger on auth.users creates profiles',
       exists (select 1 from pg_trigger
                where tgname = 'on_auth_user_created'
                  and tgrelid = 'auth.users'::regclass
                  and not tgisinternal);
